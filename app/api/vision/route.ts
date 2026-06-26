import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const image = formData.get('image') as File
    const catalogoJson = formData.get('catalogo') as string

    if (!image || !catalogoJson) {
      return NextResponse.json({ error: 'Se requiere imagen y catálogo' }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const bytes = await image.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const catalogoNames = JSON.parse(catalogoJson) as string[]

    const prompt = `Eres un asistente de extracción de datos. Analiza esta imagen de una cotización agrícola. Extrae los precios de los siguientes insumos si los encuentras: ${catalogoNames.join(', ')}. Devuelve estrictamente un JSON array con la estructura: [{"nombre_insumo": "Malla Ursus 80 cm", "precio_extraido": 45000}]. Ignora productos que no estén en la lista. Solo devuelve el JSON array, sin texto ni markdown adicional.`

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { data: base64, mimeType: image.type } },
    ])

    const text = result.response.text()
    const match = text.match(/\[[\s\S]*?\]/)
    const data = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Vision error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
}

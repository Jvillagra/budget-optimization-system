import { formatCLP } from '@/lib/business-logic'

export interface InformeBeneficiario {
  nombre: string
  segmento: string
  proveedorCompraNombre: string
  total: number
  /** false = `total` es una suma parcial, no un total cotizado. */
  totalEsCompleto: boolean
  itemsSinPrecio: number
  sinCarrito: boolean
  fotos: string[]
}

interface InformeData {
  beneficiarios: InformeBeneficiario[]
  /** Suma SOLO de los beneficiarios con cotización completa. */
  totalGeneral: number
  totalGeneralFormateado: string
  beneficiariosIncompletos: number
  fechaGeneracion: string
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderBeneficiario(b: InformeBeneficiario): string {
  const fotosHTML = b.fotos.length
    ? `<div class="fotos">${b.fotos.map(url => `<img src="${encodeURI(url)}" alt="Comprobante de compra" />`).join('')}</div>`
    : `<p class="sin-fotos">Sin fotos de comprobante subidas.</p>`

  // Un total parcial NUNCA se presenta como total: se etiqueta distinto y
  // lleva la razón al lado. Antes se imprimía la suma de los ítems con
  // precio bajo el rótulo "Total cotizado" y el auditor no podía saberlo.
  const totalHTML = b.sinCarrito
    ? `<div><dt>Total</dt><dd class="parcial">Sin carrito registrado</dd></div>`
    : b.totalEsCompleto
      ? `<div><dt>Total cotizado</dt><dd class="total">${formatCLP(b.total)}</dd></div>`
      : `<div><dt>Total parcial</dt><dd class="parcial">${formatCLP(b.total)} <span class="nota">· ${b.itemsSinPrecio} ítem(s) sin precio, no incluidos</span></dd></div>`

  return `
    <section class="beneficiario${b.totalEsCompleto ? '' : ' incompleto'}">
      <div class="beneficiario-header">
        <h3>${escapeHTML(b.nombre)}</h3>
        <span class="badge">${escapeHTML(b.segmento)}</span>
      </div>
      <dl class="datos">
        <div><dt>Proveedor de compra</dt><dd>${escapeHTML(b.proveedorCompraNombre)}</dd></div>
        ${totalHTML}
      </dl>
      ${fotosHTML}
    </section>
  `
}

export function renderInformeHTML(data: InformeData): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe Consultora</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1c1c1c;
    margin: 0;
    padding: 0;
    font-size: 12px;
  }
  h1, h2, h3 { margin: 0; }
  .portada {
    border-bottom: 3px solid #3a7d44;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .portada h1 {
    font-size: 20px;
    font-weight: 700;
    color: #2d5f35;
  }
  .portada p {
    color: rgba(0,0,0,0.62);
    margin-top: 4px;
    font-size: 11px;
  }
  .resumen {
    background: #e8f5eb;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .resumen .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #2d5f35;
    font-weight: 600;
  }
  .resumen .valor {
    font-size: 22px;
    font-weight: 700;
    color: #2d5f35;
  }
  .resumen .conteo {
    font-size: 11px;
    color: rgba(0,0,0,0.62);
  }
  .beneficiario {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .beneficiario-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .beneficiario-header h3 {
    font-size: 14px;
    color: #1c1c1c;
  }
  .badge {
    background: #f5ede4;
    color: #5c3519;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
  }
  .datos {
    display: flex;
    gap: 32px;
    margin: 0 0 10px 0;
  }
  .datos dt {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: rgba(0,0,0,0.62);
  }
  .datos dd {
    margin: 2px 0 0 0;
    font-size: 13px;
    font-weight: 600;
  }
  .datos dd.total { color: #3a7d44; }
  .datos dd.parcial { color: #8a5a00; }
  .datos dd.parcial .nota { font-weight: 500; font-size: 10px; }
  .beneficiario.incompleto { border-color: rgba(180,120,0,0.45); background: #fffaf0; }
  .aviso {
    background: #fff4e0;
    border: 1px solid rgba(180,120,0,0.35);
    color: #7a5200;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 11px;
  }
  .fotos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .fotos img {
    width: 140px;
    height: 105px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.1);
  }
  .sin-fotos {
    font-size: 11px;
    color: rgba(0,0,0,0.62);
    font-style: italic;
    margin: 0;
  }
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid rgba(0,0,0,0.1);
    font-size: 9px;
    color: rgba(0,0,0,0.62);
    text-align: center;
  }
</style>
</head>
<body>
  <div class="portada">
    <h1>Informe de Rendición — Proyecto PAT</h1>
    <p>Generado el ${escapeHTML(data.fechaGeneracion)} · Uso exclusivo para auditoría de la empresa consultora</p>
  </div>

  <div class="resumen">
    <div>
      <div class="label">Total general cotizado (solo cotizaciones completas)</div>
      <div class="valor">${escapeHTML(data.totalGeneralFormateado)}</div>
    </div>
    <div class="conteo">${data.beneficiarios.length} beneficiarios reales</div>
  </div>

  ${data.beneficiariosIncompletos > 0 ? `<div class="aviso">
    <strong>El total general no cubre a todos los beneficiarios.</strong>
    ${data.beneficiariosIncompletos} de ${data.beneficiarios.length} tienen la cotización
    incompleta (ítems sin precio o sin carrito registrado) y quedan excluidos del total
    general. Aparecen marcados en el detalle.
  </div>` : ''}

  ${data.beneficiarios.map(renderBeneficiario).join('')}

  <div class="footer">Neurobot Innovations · Proyecto PAT · Informe generado automáticamente, no reemplaza el detalle transaccional en /rendicion</div>
</body>
</html>`
}

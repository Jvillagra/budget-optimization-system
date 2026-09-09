import type { MouseEvent } from 'react'

/** Saca el foco del control cuando el clic vino de un puntero, y solo
 *  entonces. `detail > 0` es el contador de clics del mouse: con Enter o con
 *  la barra espaciadora llega en 0, asi que el usuario de teclado conserva el
 *  foco y su anillo.
 *
 *  Existe porque :focus-visible no alcanza: tras una navegacion del cliente
 *  el elemento recupera el foco y el navegador lo vuelve a considerar
 *  "visible", dejando la pastilla del menu con un anillo pegado que se lee
 *  como "campo seleccionado".
 *
 *  Se llama DESPUES del onClick del consumidor a proposito: si esa accion
 *  abrio un dialogo y ya movio el foco, blur() sobre un elemento que ya no lo
 *  tiene no hace nada. */
export function soltarFocoDePuntero(e: MouseEvent<HTMLElement>) {
  if (e.detail > 0) e.currentTarget.blur()
}

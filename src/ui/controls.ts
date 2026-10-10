export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function button(
  label: string,
  variant: 'primary' | 'solid' | 'ghost',
  onClick: () => void,
): HTMLButtonElement {
  const node = el('button', `btn btn-${variant}`, label)
  node.type = 'button'
  node.addEventListener('click', onClick)
  return node
}

export function statRow(label: string, value: string): HTMLLIElement {
  const row = el('li')
  row.append(el('span', undefined, label), document.createElement('span'))
  const valueNode = row.lastElementChild
  if (valueNode) valueNode.textContent = value
  return row
}

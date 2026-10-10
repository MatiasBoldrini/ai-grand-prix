import './ui/tokens.css'
import './ui/style.css'
import { startGame } from './game/app.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#view')
const ui = document.querySelector<HTMLElement>('#ui')
const fps = document.querySelector<HTMLElement>('#fps')

if (!canvas || !ui || !fps) {
  throw new Error('Missing game shell')
}

void startGame({ canvas, ui, fps })

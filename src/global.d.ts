/// <reference types="vite/client" />

import type { DshDesktopApi } from '../electron/preload'

declare global {
  interface Window {
    dshDesktop?: DshDesktopApi
  }
}

export {}

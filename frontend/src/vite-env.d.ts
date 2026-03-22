/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_VNPAY_URL: string
  readonly VITE_MOMO_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

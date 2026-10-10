/// <reference types="vite/client" />

interface ImportMetaEnv { readonly VITE_ALE_SESSION?: string }
interface ImportMeta { readonly env: ImportMetaEnv }

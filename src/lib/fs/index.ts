import { isTauri } from '../config'
import { FileSystemAdapter } from './types'
import { tauriFs } from './tauriAdapter'
import { browserFs } from './browserAdapter'

// Export the correct adapter based on environment
export const fs: FileSystemAdapter = isTauri() ? tauriFs : browserFs

export * from './types'
export * from './vaultIndexer'

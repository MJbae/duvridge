import { inject, type InjectionKey } from 'vue'
import type { ReaderCatalog } from '@duvridge/content-processing/types'
export const workCatalogKey: InjectionKey<ReaderCatalog> = Symbol('work-catalog')
export function useWorkCatalog<T extends ReaderCatalog = ReaderCatalog>() {
  const catalog = inject(workCatalogKey)
  if (!catalog) throw new Error('작품 목록이 로드되지 않았습니다.')
  return catalog as T
}

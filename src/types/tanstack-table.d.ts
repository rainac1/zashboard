import type { RowData } from '@tanstack/vue-table'

// 给列定义补一个 meta.cellClass,VirtualTable 用它决定单元格的宽度/截断策略。
// headerClass 单独给表头用:table-fixed 下列宽只认表头那一行。
declare module '@tanstack/vue-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClass?: string
    headerClass?: string
    noCellTitle?: boolean
  }
}

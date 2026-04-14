export type RevenuePoint = {
  label: string
  month: string
  year: number
  total: number
}

export const revenueOverviewData: RevenuePoint[] = [
  { label: "Jan '24", month: 'Jan', year: 2024, total: 24800 },
  { label: "Feb '24", month: 'Feb', year: 2024, total: 23100 },
  { label: "Mar '24", month: 'Mar', year: 2024, total: 25700 },
  { label: "Apr '24", month: 'Apr', year: 2024, total: 24400 },
  { label: "May '24", month: 'May', year: 2024, total: 26800 },
  { label: "Jun '24", month: 'Jun', year: 2024, total: 28100 },
  { label: "Jul '24", month: 'Jul', year: 2024, total: 27300 },
  { label: "Aug '24", month: 'Aug', year: 2024, total: 28900 },
  { label: "Sep '24", month: 'Sep', year: 2024, total: 30100 },
  { label: "Oct '24", month: 'Oct', year: 2024, total: 33800 },
  { label: "Nov '24", month: 'Nov', year: 2024, total: 36700 },
  { label: "Dec '24", month: 'Dec', year: 2024, total: 39500 },
  { label: "Jan '25", month: 'Jan', year: 2025, total: 31800 },
  { label: "Feb '25", month: 'Feb', year: 2025, total: 30400 },
  { label: "Mar '25", month: 'Mar', year: 2025, total: 32900 },
  { label: "Apr '25", month: 'Apr', year: 2025, total: 32100 },
  { label: "May '25", month: 'May', year: 2025, total: 34700 },
  { label: "Jun '25", month: 'Jun', year: 2025, total: 36100 },
]

export const currentYearRevenueOverviewData = revenueOverviewData
  .filter((point) => point.year === 2025)
  .map(({ month, total }) => ({ name: month, total }))

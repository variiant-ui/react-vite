import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { currentYearRevenueOverviewData } from '../data/chart-data'

export function Overview() {
  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={currentYearRevenueOverviewData}>
        <XAxis
          dataKey='name'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          direction='ltr'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${value}`}
        />
        <Bar
          dataKey='total'
          fill='currentColor'
          radius={[4, 4, 0, 0]}
          className='fill-primary'
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

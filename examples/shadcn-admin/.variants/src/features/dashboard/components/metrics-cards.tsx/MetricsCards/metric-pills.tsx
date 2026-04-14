import { Activity, CreditCard, DollarSign, Users } from 'lucide-react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Line,
  LineChart,
  ResponsiveContainer,
} from 'recharts'

type TrendPoint = {
  label: string
  value: number
}

type MetricCard = {
  title: string
  value: string
  change: string
  icon: typeof DollarSign
  strokeColor: string
  trend: TrendPoint[]
}

function PillMetricCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
  strokeColor,
}: MetricCard) {
  return (
    <Card className='rounded-2xl border-border shadow'>
      <CardContent className='flex min-h-16 items-center gap-3 px-4 py-3'>
        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted'>
          <Icon className='h-4 w-4 text-muted-foreground' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-baseline justify-between gap-3'>
            <div className='min-w-0'>
              <p className='truncate text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground'>
                {title}
              </p>
              <div className='truncate text-lg font-semibold leading-none'>
                {value}
              </div>
            </div>
            <p className='shrink-0 text-[11px] font-medium text-muted-foreground'>
              {change}
            </p>
          </div>
        </div>
        <div className='h-8 w-20 shrink-0'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <Line
                type='monotone'
                dataKey='value'
                stroke={strokeColor}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 2.5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MetricsCardsMetricPills() {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {metricCards.map((metric) => (
        <PillMetricCard key={metric.title} {...metric} />
      ))}
    </div>
  )
}

const metricCards: MetricCard[] = [
  {
    title: 'Total Revenue',
    value: '$45,231.89',
    change: '+20.1%',
    icon: DollarSign,
    strokeColor: '#111111',
    trend: [
      { label: 'Jan', value: 25 },
      { label: 'Feb', value: 23 },
      { label: 'Mar', value: 27 },
      { label: 'Apr', value: 26 },
      { label: 'May', value: 29 },
      { label: 'Jun', value: 31 },
      { label: 'Jul', value: 30 },
      { label: 'Aug', value: 34 },
    ],
  },
  {
    title: 'Subscriptions',
    value: '+2,350',
    change: '+180.1%',
    icon: Users,
    strokeColor: '#111111',
    trend: [
      { label: 'Jan', value: 11 },
      { label: 'Feb', value: 10 },
      { label: 'Mar', value: 14 },
      { label: 'Apr', value: 13 },
      { label: 'May', value: 17 },
      { label: 'Jun', value: 19 },
      { label: 'Jul', value: 18 },
      { label: 'Aug', value: 22 },
    ],
  },
  {
    title: 'Sales',
    value: '+12,234',
    change: '+19%',
    icon: CreditCard,
    strokeColor: '#111111',
    trend: [
      { label: 'Jan', value: 18 },
      { label: 'Feb', value: 17 },
      { label: 'Mar', value: 21 },
      { label: 'Apr', value: 20 },
      { label: 'May', value: 22 },
      { label: 'Jun', value: 24 },
      { label: 'Jul', value: 23 },
      { label: 'Aug', value: 26 },
    ],
  },
  {
    title: 'Active Now',
    value: '+573',
    change: '+201',
    icon: Activity,
    strokeColor: '#111111',
    trend: [
      { label: 'Jan', value: 12 },
      { label: 'Feb', value: 14 },
      { label: 'Mar', value: 13 },
      { label: 'Apr', value: 17 },
      { label: 'May', value: 16 },
      { label: 'Jun', value: 18 },
      { label: 'Jul', value: 17 },
      { label: 'Aug', value: 21 },
    ],
  },
]

import { Activity, CreditCard, DollarSign, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Analytics } from '@/features/dashboard/components/analytics'
import { revenueOverviewData } from '@/features/dashboard/data/chart-data'
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

function SparklineMetricCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
  strokeColor,
}: MetricCard) {
  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-0'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent className='space-y-2'>
        <div>
          <div className='text-2xl font-bold'>{value}</div>
          <p className='text-xs text-muted-foreground'>{change}</p>
        </div>
        <div className='h-14'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={trend} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
              <Line
                type='monotone'
                dataKey='value'
                stroke={strokeColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function MultiYearOverview() {
  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={revenueOverviewData}>
        <XAxis
          dataKey='label'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
          minTickGap={20}
        />
        <YAxis
          direction='ltr'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`}
          contentStyle={{
            borderColor: 'var(--border)',
            borderRadius: 'calc(var(--radius) - 2px)',
            backgroundColor: 'var(--card)',
          }}
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

function SalesTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className='text-right'>Sale Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.map((sale) => (
          <TableRow key={sale.email}>
            <TableCell className='font-medium'>{sale.name}</TableCell>
            <TableCell className='text-muted-foreground'>{sale.email}</TableCell>
            <TableCell className='text-right font-medium tabular-nums'>
              {sale.amount}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function DashboardSparklineStacked() {
  return (
    <>
      <Header>
        <TopNav links={topNav} />
        <div className='ms-auto flex items-center space-x-4'>
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
          <div className='flex items-center space-x-2'>
            <Button>Download</Button>
          </div>
        </div>
        <Tabs
          orientation='vertical'
          defaultValue='overview'
          className='space-y-4'
        >
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>Overview</TabsTrigger>
              <TabsTrigger value='analytics'>Analytics</TabsTrigger>
              <TabsTrigger value='reports' disabled>
                Reports
              </TabsTrigger>
              <TabsTrigger value='notifications' disabled>
                Notifications
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {metricCards.map((metric) => (
                <SparklineMetricCard key={metric.title} {...metric} />
              ))}
            </div>
            <div className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <CardDescription>
                    Revenue across the last eighteen months.
                  </CardDescription>
                </CardHeader>
                <CardContent className='px-2 sm:px-6'>
                  <MultiYearOverview />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent Sales</CardTitle>
                  <CardDescription>
                    You made 265 sales this month across your core accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesTable />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value='analytics' className='space-y-4'>
            <Analytics />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: 'Overview',
    href: 'dashboard/overview',
    isActive: true,
    disabled: false,
  },
  {
    title: 'Customers',
    href: 'dashboard/customers',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Products',
    href: 'dashboard/products',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Settings',
    href: 'dashboard/settings',
    isActive: false,
    disabled: true,
  },
]

const metricCards: MetricCard[] = [
  {
    title: 'Total Revenue',
    value: '$45,231.89',
    change: '+20.1% from last month',
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
    change: '+180.1% from last month',
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
    change: '+19% from last month',
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
    change: '+201 since last hour',
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

const sales = [
  { name: 'Olivia Martin', email: 'olivia.martin@email.com', amount: '$1,999.00' },
  { name: 'Jackson Lee', email: 'jackson.lee@email.com', amount: '$839.00' },
  { name: 'Isabella Nguyen', email: 'isabella.nguyen@email.com', amount: '$412.00' },
  { name: 'William Kim', email: 'will@email.com', amount: '$289.00' },
  { name: 'Sofia Davis', email: 'sofia.davis@email.com', amount: '$2,429.00' },
  { name: 'Mason Patel', email: 'mason.patel@email.com', amount: '$154.00' },
]

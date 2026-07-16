import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { EffectScatterChart, LineChart, MapChart } from 'echarts/charts'
import {
  GeoComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  BarChart3,
  Leaf,
  MapPinned,
  RefreshCw,
} from 'lucide-react'
import chinaGeoJson from 'china-geojson/src/geojson/china.json'
import modelDataJson from './data/model-data.json'
import modelMetaJson from './data/model-meta.json'
import './App.css'

type CarbonItem = {
  id: string
  name: string
  strength: number | null
  strengthUnit: string
  factor: number
  factorUnit: string
  carbonFootprint: number | null
  resultUnit: string
  dataStatus: string
  note: string
  backendColumn: number
}

type CarbonRecord = {
  key: string
  year: number
  province: string
  crop: string
  total: number
  perTon: number
  unit: string
  perTonUnit: string
  items: CarbonItem[]
}

type ModelData = {
  syncedAt: string
  sourceWorkbook: string
  defaultSelection: { year: number; province: string }
  years: number[]
  provinces: string[]
  records: Record<string, CarbonRecord>
}

type ModelMeta = {
  title: string
  dataRange: {
    years: string
    yearCount: number
    provinceCount: number
    recordCount: number
  }
  formulas: string[]
  assumptions: string[]
  syncNotes: string[]
}

type ActiveTab = '核算' | 'TSB分析'

const modelData = modelDataJson as ModelData
const modelMeta = modelMetaJson as ModelMeta
const PLATFORM_TITLE = '北京师范大学中国省级农食系统LCA碳足迹核算平台'

echarts.use([
  EffectScatterChart,
  GeoComponent,
  GridComponent,
  LineChart,
  MapChart,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])

const REGION_ID_TO_NAME: Record<string, string> = {
  '11': '北京',
  '12': '天津',
  '13': '河北',
  '14': '山西',
  '15': '内蒙古',
  '21': '辽宁',
  '22': '吉林',
  '23': '黑龙江',
  '31': '上海',
  '32': '江苏',
  '33': '浙江',
  '34': '安徽',
  '35': '福建',
  '36': '江西',
  '37': '山东',
  '41': '河南',
  '42': '湖北',
  '43': '湖南',
  '44': '广东',
  '45': '广西',
  '46': '海南',
  '50': '重庆',
  '51': '四川',
  '52': '贵州',
  '53': '云南',
  '54': '西藏',
  '61': '陕西',
  '62': '甘肃',
  '63': '青海',
  '64': '宁夏',
  '65': '新疆',
}

function formatNumber(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}

function formatShort(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return value < 0.01 ? value.toFixed(4) : value.toFixed(3)
}

function formatUnit(unit: string) {
  return unit.replaceAll('CO2', 'CO₂').replaceAll(' 稻谷', '')
}

function recordKey(year: number, province: string) {
  return `${year}_${province}`
}

function statusClass(status: string) {
  if (status.includes('全国')) return 'status status-fill'
  if (status.includes('缺少')) return 'status status-missing'
  if (status.includes('原表')) return 'status status-source'
  return 'status'
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function prepareChinaGeoJson() {
  const geoJson = JSON.parse(JSON.stringify(chinaGeoJson)) as {
    features: Array<{
      id?: string | number
      properties?: { cp?: [number, number]; id?: string | number; name?: string }
    }>
  }

  geoJson.features.forEach((feature) => {
    const regionId = String(feature.properties?.id ?? feature.id ?? '')
    const name = REGION_ID_TO_NAME[regionId]
    if (name) {
      feature.properties = { ...feature.properties, name }
    }
  })

  return geoJson
}

function getProvinceCoord(
  geoJson: ReturnType<typeof prepareChinaGeoJson>,
  province: string,
) {
  const feature = geoJson.features.find(
    (item) => item.properties?.name === province,
  )
  return feature?.properties?.cp
}

function ContributionBars({ record }: { record: CarbonRecord }) {
  const maxValue = Math.max(
    ...record.items.map((item) => item.carbonFootprint ?? 0),
    0.001,
  )

  return (
    <div className="contribution-bars">
      {record.items.map((item, index) => {
        const value = item.carbonFootprint ?? 0
        const share = record.total > 0 ? value / record.total : 0
        return (
          <div className="bar-row" key={item.id}>
            <span className="bar-label">{item.name}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={
                  {
                    width: `${Math.max((value / maxValue) * 100, 1)}%`,
                    '--bar-delay': `${index * 70}ms`,
                  } as CSSProperties
                }
              />
            </span>
            <span className="bar-value">
              {formatNumber(value, 4)}
              <small>{(share * 100).toFixed(1)}%</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TrendChart({
  points,
  selectedYear,
}: {
  points: CarbonRecord[]
  selectedYear: number
}) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    const selectedPoint = points.find((point) => point.year === selectedYear)

    chart.setOption({
      grid: { left: 46, right: 20, top: 30, bottom: 38 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { lineStyle: { color: '#7cb47a' } },
        formatter: (params: Array<{ axisValue: string; data: number }>) => {
          const item = params[0]
          if (!item) return ''
          return `${item.axisValue}<br/>${item.data.toFixed(3)} kg CO₂e/kg`
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) => String(point.year)),
        axisLine: { lineStyle: { color: '#d8e5d7' } },
        axisTick: { show: false },
        axisLabel: { color: '#6b766b', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: {
          color: '#6b766b',
          formatter: (value: number) => value.toFixed(2),
        },
        splitLine: { lineStyle: { color: '#e9f0e8' } },
      },
      series: [
        {
          name: '单位碳足迹',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          data: points.map((point) => Number(point.total.toFixed(4))),
          lineStyle: { color: '#247a3d', width: 3 },
          itemStyle: { color: '#ffffff', borderColor: '#247a3d', borderWidth: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(68, 151, 78, 0.28)' },
                { offset: 1, color: 'rgba(68, 151, 78, 0.02)' },
              ],
            },
          },
          markPoint: selectedPoint
            ? {
                symbol: 'circle',
                symbolSize: 18,
                itemStyle: { color: '#f1b94e', borderColor: '#17452a', borderWidth: 2 },
                label: {
                  color: '#18351f',
                  formatter: `${selectedPoint.year}  ${formatNumber(selectedPoint.total, 3)}`,
                  fontWeight: 700,
                  offset: [0, -22],
                },
                data: [{ xAxis: String(selectedPoint.year), yAxis: selectedPoint.total }],
              }
            : undefined,
        },
      ],
    })

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [points, selectedYear])

  return <div className="trend-chart" ref={chartRef} />
}

function ChinaMap({
  records,
  selectedProvince,
}: {
  records: CarbonRecord[]
  selectedProvince: string
}) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    const geoJson = prepareChinaGeoJson()
    echarts.registerMap('china-rice-cf', geoJson as Parameters<typeof echarts.registerMap>[1])

    const values = records.map((record) => record.total)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const selectedRecord = records.find(
      (record) => record.province === selectedProvince,
    )
    const selectedCoord = getProvinceCoord(geoJson, selectedProvince)

    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (params: { componentSubType?: string; name: string; value?: number | number[] }) => {
          const value = Array.isArray(params.value)
            ? params.value[2]
            : params.value
          if (typeof value !== 'number' || Number.isNaN(value)) {
            return `${params.name}<br/>无当前模型数据`
          }
          return `${params.name}<br/>${value.toFixed(3)} kg CO₂e/kg`
        },
      },
      visualMap: {
        min,
        max,
        left: 8,
        bottom: 8,
        text: ['高', '低'],
        itemHeight: 120,
        calculable: false,
        inRange: { color: ['#edf7e9', '#9bcf8b', '#237a3c'] },
        textStyle: { color: '#58635b', fontSize: 11 },
      },
      series: [
        {
          name: '单位碳足迹',
          type: 'map',
          map: 'china-rice-cf',
          roam: false,
          selectedMode: false,
          emphasis: {
            label: { color: '#173f27' },
            itemStyle: { areaColor: '#f5b84b' },
          },
          itemStyle: {
            areaColor: '#eef8ec',
            borderColor: '#bcd8ba',
            borderWidth: 1,
            shadowColor: 'rgba(34, 75, 42, 0.08)',
            shadowBlur: 4,
          },
          data: records.map((record) => ({
            name: record.province,
            value: record.total,
            selected: record.province === selectedProvince,
            itemStyle:
              record.province === selectedProvince
                ? {
                    borderColor: '#142f1d',
                    borderWidth: 2.4,
                    shadowBlur: 12,
                    shadowColor: 'rgba(20, 47, 29, 0.28)',
                  }
                : undefined,
          })),
        },
        ...(selectedRecord && selectedCoord
          ? [
              {
                name: '当前省份',
                type: 'effectScatter',
                coordinateSystem: 'geo',
                symbolSize: 14,
                rippleEffect: { brushType: 'stroke', scale: 3.6 },
                zlevel: 2,
                itemStyle: { color: '#173f27' },
                label: {
                  show: true,
                  formatter: `${selectedProvince} ${formatNumber(selectedRecord.total, 3)}`,
                  position: 'right',
                  color: '#173f27',
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: 'rgba(255, 255, 255, 0.86)',
                  borderColor: '#b8d7b5',
                  borderWidth: 1,
                  borderRadius: 4,
                  padding: [4, 6],
                },
                data: [
                  {
                    name: selectedProvince,
                    value: [...selectedCoord, selectedRecord.total],
                  },
                ],
              },
            ]
          : []),
      ],
      geo: {
        map: 'china-rice-cf',
        roam: false,
        silent: true,
        itemStyle: { opacity: 0 },
        emphasis: { disabled: true },
      },
    })

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [records, selectedProvince])

  return <div className="map-chart" ref={chartRef} />
}

function App() {
  const defaultYear = modelData.years.includes(2015)
    ? 2015
    : modelData.years.at(-1) ?? 2021
  const defaultProvince = modelData.provinces.includes('北京')
    ? '北京'
    : modelData.provinces[0]

  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [selectedProvince, setSelectedProvince] = useState(defaultProvince)
  const [activeTab, setActiveTab] = useState<ActiveTab>('核算')
  const [hoveredTab, setHoveredTab] = useState<ActiveTab | null>(null)
  const [lastCalculatedAt, setLastCalculatedAt] = useState('刚刚')

  const currentRecord = modelData.records[recordKey(selectedYear, selectedProvince)]
  const provinceTrend = useMemo(
    () =>
      modelData.years
        .map((year) => modelData.records[recordKey(year, selectedProvince)])
        .filter((record): record is CarbonRecord => Boolean(record)),
    [selectedProvince],
  )
  const nationalRecords = useMemo(
    () =>
      modelData.provinces
        .map((province) => modelData.records[recordKey(selectedYear, province)])
        .filter((record): record is CarbonRecord => Boolean(record)),
    [selectedYear],
  )
  const nationalStats = useMemo(() => {
    const ranked = [...nationalRecords].sort((a, b) => a.total - b.total)
    const rank = ranked.findIndex((record) => record.province === selectedProvince) + 1
    const values = nationalRecords.map((record) => record.total)
    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    return {
      rank,
      count: ranked.length,
      average,
      median: median(values),
      min: ranked[0],
      max: ranked.at(-1),
    }
  }, [nationalRecords, selectedProvince])

  if (!currentRecord) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>{PLATFORM_TITLE}</h1>
          <p>没有找到当前年份和省份的模型记录，请先运行 npm run sync-excel</p>
        </section>
      </main>
    )
  }

  const diffFromAverage = currentRecord.total - nationalStats.average
  const syncTime = new Date(modelData.syncedAt).toLocaleString('zh-CN', {
    hour12: false,
  })
  const tabs: ActiveTab[] = ['核算', 'TSB分析']

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}bnu-emblem.jpg`} alt="北京师范大学校徽" />
          </span>
          <div className="brand-copy">
            <h1>{PLATFORM_TITLE}</h1>
          </div>
        </div>

        <div className="topbar-tools">
          <nav
            className={`tabs header-tabs ${
              (hoveredTab ?? activeTab) === 'TSB分析' ? 'slide-right' : 'slide-left'
            }`}
            aria-label="页面视图"
            onMouseLeave={() => setHoveredTab(null)}
          >
            {tabs.map((tab) => (
              <button
                className={activeTab === tab ? 'tab active' : 'tab'}
                key={tab}
                onMouseEnter={() => setHoveredTab(tab)}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab === '核算' ? <BarChart3 size={17} /> : null}
                {tab === 'TSB分析' ? <MapPinned size={17} /> : null}
                {tab}
              </button>
            ))}
          </nav>

          <div className="header-controls" aria-label="参数设置">
            <label>
              年份
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              >
                {modelData.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              省份
              <select
                value={selectedProvince}
                onChange={(event) => setSelectedProvince(event.target.value)}
              >
                {modelData.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="primary-action header-action"
              onClick={() => setLastCalculatedAt(new Date().toLocaleTimeString('zh-CN'))}
              type="button"
            >
              <RefreshCw size={18} />
              重新核算
            </button>

            <p className="update-note header-update">
              更新时间：{lastCalculatedAt}
              <span>最近同步：{syncTime}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="main-view">
          {activeTab === '核算' ? (
            <>
              <section className="panel footprint-overview">
                <article className="footprint-result">
                  <span>
                    <Leaf size={18} />
                    单位碳足迹
                  </span>
                  <strong>{formatNumber(currentRecord.total, 3)}</strong>
                  <p>{formatUnit(currentRecord.unit)}</p>
                </article>

                <div className="footprint-contribution">
                  <div className="section-heading">
                    <h2>碳足迹贡献分解</h2>
                    <span>{formatUnit(currentRecord.unit)}</span>
                  </div>
                  <ContributionBars record={currentRecord} />
                </div>
              </section>

              <section className="panel table-panel">
                <div className="section-heading">
                  <h2>投入来源明细</h2>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>投入来源</th>
                      <th>投入强度</th>
                      <th>系数</th>
                      <th>分项碳足迹</th>
                      <th>贡献比例</th>
                      <th>数据状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRecord.items.map((item) => {
                      const share =
                        item.carbonFootprint === null
                          ? 0
                          : item.carbonFootprint / currentRecord.total
                      return (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>
                            {formatShort(item.strength)} {item.strengthUnit}
                          </td>
                          <td>
                            {formatShort(item.factor)} {formatUnit(item.factorUnit)}
                          </td>
                          <td>{formatNumber(item.carbonFootprint, 4)}</td>
                          <td>{(share * 100).toFixed(1)}%</td>
                          <td>
                            <span className={statusClass(item.dataStatus)}>
                              {item.dataStatus}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            </>
          ) : null}

          {activeTab === 'TSB分析' ? (
            <section className="tsb-grid" aria-label="TSB 分析">
              <article className="panel tsb-panel map-panel">
                <div className="section-heading">
                  <h2>Space 空间</h2>
                  <span>{selectedYear} 年 · {selectedProvince}</span>
                </div>
                <ChinaMap records={nationalRecords} selectedProvince={selectedProvince} />
                <div className="space-stats">
                  <span>全国均值 <strong>{formatNumber(nationalStats.average, 3)}</strong></span>
                  <span>{diffFromAverage <= 0 ? '低于均值' : '高于均值'} <strong>{Math.abs(diffFromAverage).toFixed(3)}</strong></span>
                  <span>低碳排序 <strong>{nationalStats.rank}/{nationalStats.count}</strong></span>
                </div>
              </article>

              <article className="panel tsb-panel trend-panel">
                <div className="section-heading">
                  <h2>Time 时间</h2>
                  <span>{selectedProvince} · {modelMeta.dataRange.years}</span>
                </div>
                <TrendChart points={provinceTrend} selectedYear={selectedYear} />
                <div className="tsb-summary">
                  <strong>{formatNumber(currentRecord.total, 3)}</strong>
                  <span>{selectedYear} 年 {formatUnit(currentRecord.unit)}</span>
                </div>
              </article>

              <article className="panel tsb-panel boundary-panel">
                <div className="section-heading">
                  <h2>Boundary 边界</h2>
                </div>
                <div className="boundary-current">
                  <span>当前接入边界</span>
                  <strong>水稻 · 生产端</strong>
                  <p>当前覆盖农业生产投入，后续扩展更多食物与生命周期阶段</p>
                </div>
                <div className="boundary-stages" aria-label="生命周期边界">
                  <span className="stage active">生产</span>
                  <span className="stage pending">加工</span>
                  <span className="stage pending">运输</span>
                  <span className="stage pending">烹饪</span>
                </div>
                <div className="boundary-note">
                  <div>
                    <span>已核算</span>
                    <p>化肥、农药、农膜、燃料动力、排灌</p>
                  </div>
                  <div>
                    <span>待纳入</span>
                    <p>加工能耗、物流方式、家庭或餐饮烹饪能源</p>
                  </div>
                </div>
              </article>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default App

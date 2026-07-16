# 北京师范大学中国省级农食系统LCA碳足迹核算平台

这个项目把同目录上一级的 `模型test.xlsx` 同步成网页可用数据，并提供核算、时间序列、全国排名和省级空间分布视图。

## 常用命令

```bash
npm run sync-excel
npm run dev
npm run build
```

`npm run dev` 和 `npm run build` 会先自动执行一次同步。Excel 更新后，也可以手动运行 `npm run sync-excel`。

## 数据同步规则

- 默认读取 `../模型test.xlsx`。
- 读取 `核算端`、`后台数据`、`单位统一与碳足迹核算` 三个 sheet。
- 输出数据到 `src/data/model-data.json` 和 `src/data/model-meta.json`。
- 新增年份或省份时，只要仍在 `后台数据` 的现有字段结构中，网站会自动出现新选项。
- 新增核算项时，应继续使用 `核算端` 的六列结构：投入类别、投入强度、强度单位、足迹系数、系数单位、单位碳足迹，并保留 `碳足迹总计` 行。

## 当前验证基准

默认记录为 `2021_广东`，同步后单位碳足迹约为 `0.214758 kg CO₂e/kg 稻谷`。

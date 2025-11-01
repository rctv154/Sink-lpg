# Analytics Data Differences

## 为什么数据会有差异？

在使用 Sink 的统计功能时，你可能会注意到以下数据之间存在一些差异：

1. **链接列表页**的今日/昨日统计
2. **详情页**的统计数据
3. **分析页面**的统计数据

这些差异是正常的，主要由以下原因造成：

### 1. Cloudflare Analytics Engine 的采样机制

Cloudflare Analytics Engine 使用**自适应采样**来提高查询性能：

- 数据量小时：接近 100% 采样
- 数据量大时：自动采样（如 1:10 或更高比例）
- `_sample_interval` 字段表示该记录代表的实际记录数

**影响**：
- `SUM(_sample_interval)` 对 PV 统计是准确的
- `COUNT(DISTINCT ip)` 在 GROUP BY 查询中可能不完全准确
- 不同查询方式的采样率可能不同

### 2. 查询方式的差异

#### 链接列表页
```sql
-- 使用 GROUP BY 按链接分组
SELECT index1 as id, 
       SUM(_sample_interval) as pv,
       COUNT(DISTINCT ip) as uv
FROM dataset
WHERE timestamp >= todayStart AND timestamp < todayEnd
GROUP BY index1
```

#### 详情页/分析页
```sql
-- 直接过滤特定链接或全局统计
SELECT SUM(_sample_interval) as visits,
       COUNT(DISTINCT ip) as visitors
FROM dataset
WHERE index1 = 'xxx' AND timestamp >= startAt AND timestamp <= endAt
```

**差异原因**：
- GROUP BY 会影响 COUNT(DISTINCT) 的采样精度
- 详情页可以自定义时间范围，列表页固定今日/昨日
- 查询时间点不同，数据可能有微小变化

### 3. 时间范围差异

- **链接列表页**：固定为服务器时区的今日 00:00 - 23:59 和昨日 00:00 - 23:59
- **详情页**：可自定义时间范围（如最近 24 小时）
- **分析页面**：可自定义时间范围

### 4. 数据延迟

Cloudflare Analytics Engine 的数据写入有轻微延迟（通常几秒内），两次查询之间可能有新数据写入。

## 数据差异范围

通常情况下：
- **PV（浏览次数）**：差异 < 1%（因为使用 SUM(_sample_interval)）
- **UV（独立访客）**：差异 < 5%（受采样影响）
- **IP 数量**：差异 < 5%（受采样影响）

如果差异超过 10%，可能需要检查：
1. 时间范围是否一致
2. 是否有过滤条件差异
3. 服务器时区设置是否正确

## 如何获取更准确的数据？

1. **使用详情页的自定义时间范围**
   - 可以精确指定时间范围
   - 适合生成报告

2. **导出原始数据**
   - 未来版本将支持导出功能
   - 可以在本地进行精确统计

3. **接受合理的误差**
   - 统计数据本身就是估算值
   - 100 左右的差异在大数据量下是正常的

## 总结

数据差异是 Cloudflare Analytics Engine 设计的一部分，用于平衡**性能**和**准确性**：

- ✅ **趋势分析**：完全可靠
- ✅ **相对比较**：准确
- ⚠️ **精确数值**：可能有小幅偏差（通常 < 5%）

对于大多数使用场景，这个精度已经足够。如果需要绝对精确的统计，建议使用专门的分析工具或导出原始日志。


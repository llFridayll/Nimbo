export function ChartSkeleton({ height = 288 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" style={{ height }} />;
}



interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: string;
  badge?: number;
}

export default function KpiCard({ label, value, sub, color = '#C9A84C', icon, badge }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-2 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold mt-1" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <span className="text-3xl opacity-80">{icon}</span>
        )}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <div className="absolute bottom-0 left-0 h-1 w-full" style={{ backgroundColor: color, opacity: 0.4 }} />
    </div>
  );
}

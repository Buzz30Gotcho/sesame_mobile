

type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'or' | 'gray' | 'blue';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  count?: number;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800 border border-green-200',
  info: 'bg-blue-100 text-blue-800 border border-blue-200',
  warning: 'bg-orange-100 text-orange-800 border border-orange-200',
  danger: 'bg-red-100 text-red-800 border border-red-200',
  or: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  gray: 'bg-gray-100 text-gray-700 border border-gray-200',
  blue: 'bg-blue-100 text-blue-800 border border-blue-200',
};

export function getStatusVariant(statut: string): BadgeVariant {
  switch (statut?.toLowerCase()) {
    case 'terminee':
    case 'termine':
    case 'valide':
    case 'vire':
      return 'success';
    case 'acceptee':
    case 'en_route':
    case 'code_valide':
    case 'actif':
      return 'info';
    case 'recherche':
    case 'en_attente':
    case 'en attente':
      return 'warning';
    case 'annulee':
    case 'annule':
    case 'refuse':
    case 'inactif':
    case 'suspendu':
      return 'danger';
    case 'physique':
      return 'or';
    case 'moral':
      return 'blue';
    default:
      return 'gray';
  }
}

export default function Badge({ label, variant = 'gray', count }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]}`}>
      {label}
      {count !== undefined && count > 0 && (
        <span className="bg-red-500 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center font-bold">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}

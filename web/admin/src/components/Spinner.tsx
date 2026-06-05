

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };

export default function Spinner({ size = 'md', color = '#C9A84C' }: SpinnerProps) {
  return (
    <div className="flex items-center justify-center p-4">
      <div
        className={`${sizes[size]} rounded-full border-2 border-gray-200 animate-spin`}
        style={{ borderTopColor: color }}
      />
    </div>
  );
}

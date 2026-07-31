interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ElementType;
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: PageHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-foreground)]">
          {Icon && (
            <Icon className="w-5 h-5 text-[var(--color-primary)]" aria-hidden />
          )}
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

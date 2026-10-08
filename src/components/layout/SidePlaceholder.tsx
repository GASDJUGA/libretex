import { PanelHeader } from "../common/PanelHeader";

type SidePlaceholderProps = {
  title: string;
  description: string;
};

export function SidePlaceholder({ title, description }: SidePlaceholderProps) {
  return (
    <section className="flex h-full flex-col bg-panel" aria-label={title}>
      <PanelHeader title={title} />
      <p className="p-4 text-sm text-fg-muted">{description}</p>
    </section>
  );
}

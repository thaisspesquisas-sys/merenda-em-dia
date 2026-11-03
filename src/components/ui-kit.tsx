import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { MESES } from "@/lib/estoque";

export function NSelect({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="no-print mb-7 flex flex-wrap items-end justify-between gap-3 border-b pb-5">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-4 shadow-card md:p-5", className)}>{children}</div>;
}

export function OrigemBadge({ origem }: { origem: "mercado" | "agricultura" }) {
  return origem === "mercado" ? (
    <span className="inline-flex rounded-full bg-mercado-soft px-2 py-0.5 text-xs font-semibold text-mercado">Mercado</span>
  ) : (
    <span className="inline-flex rounded-full bg-agricultura-soft px-2 py-0.5 text-xs font-semibold text-agricultura">Agric. Familiar</span>
  );
}

export function MesAno({ mes, ano, onMes, onAno }: { mes: number; ano: number; onMes: (m: number) => void; onAno: (a: number) => void }) {
  const y = new Date().getFullYear();
  return (
    <div className="flex gap-2">
      <NSelect value={mes} onChange={(e) => onMes(Number(e.target.value))} className="w-36">
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </NSelect>
      <NSelect value={ano} onChange={(e) => onAno(Number(e.target.value))} className="w-24">
        {[y - 3, y - 2, y - 1, y, y + 1].map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </NSelect>
    </div>
  );
}

export function SemEscola() {
  return <Panel><p className="text-sm text-muted-foreground">Nenhuma unidade escolar selecionada. Cadastre uma escola ou peça ao administrador para vincular você a uma.</p></Panel>;
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/quote-format";
import { toast } from "sonner";
import { ChevronRight, Plus, Sparkles, Copy, Check, Trash2, Edit3, Camera } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orçamentos PauliFest" },
      {
        name: "description",
        content:
          "Fotografe a tela do PDV e gere a mensagem de orçamento da PauliFest pronta para o WhatsApp em segundos.",
      },
      { property: "og:title", content: "Orçamentos PauliFest" },
      {
        property: "og:description",
        content:
          "Fotografe a tela do PDV e gere a mensagem de orçamento da PauliFest pronta para o WhatsApp em segundos.",
      },
    ],
  }),
  component: Home,
});

const statusStyle: Record<string, { label: string; bg: string; text: string }> = {
  rascunho: { label: "Rascunho", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
  enviado: { label: "Enviado", bg: "bg-blue-100 dark:bg-blue-950/60", text: "text-blue-600 dark:text-blue-400" },
  pago: { label: "Pago", bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-600 dark:text-emerald-400" },
  separando: { label: "Separando", bg: "bg-amber-100 dark:bg-amber-950/60", text: "text-amber-700 dark:text-amber-400" },
  concluido: { label: "Concluído", bg: "bg-purple-100 dark:bg-purple-950/60", text: "text-purple-600 dark:text-purple-400" },
};

function Home() {
  const [copiedPix, setCopiedPix] = useState(false);

  const store = useQuery({
    queryKey: ["store", "paulifest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, pix_key")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const quotes = useQuery({
    queryKey: ["quotes", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, total, status, created_at, quote_items(id, product, quantity, unit_price, total_price)")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const handleCopyPix = async (pix: string) => {
    try {
      await navigator.clipboard.writeText(pix);
      setCopiedPix(true);
      toast.success("Chave Pix copiada!");
      setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      toast.error("Erro ao copiar chave Pix.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-black text-foreground antialiased selection:bg-primary/20 pb-36">
      {/* Sticky iOS Translucent Top Navigation Bar */}
      <header className="sticky top-0 z-30 glass-header px-5 py-3.5">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="/favicon.png"
                alt="Ícone do app PauliFest"
                width={40}
                height={40}
                className="h-10 w-10 rounded-xl shadow-xs ring-1 ring-black/5 dark:ring-white/10 object-cover"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-black" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Balcão PDV
              </p>
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-tight">
                {store.data?.name ?? "PauliFest"}
              </h1>
            </div>
          </div>

          {store.data?.pix_key?.trim() && (
            <button
              type="button"
              onClick={() => handleCopyPix(store.data!.pix_key!)}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 ios-press active:scale-[0.95]"
              title="Copiar chave Pix"
            >
              <span className="text-[11px] text-muted-foreground">Pix</span>
              {copiedPix ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-md px-4 pt-4 space-y-6">
        {/* Hero Card - iOS 17 Style */}
        <section className="ios-animate-in rounded-3xl bg-white dark:bg-zinc-900 p-5 shadow-xs border border-black/5 dark:border-white/10">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Camera className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                Orçamentos por Foto <Sparkles className="h-4 w-4 text-amber-500 fill-amber-500/20" />
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fotografe a tela do PDV e a inteligência artificial gera a mensagem pronta para o WhatsApp em instantes.
              </p>
            </div>
          </div>
        </section>

        {/* Quotes Section - iOS Grouped Inset List */}
        <section className="ios-animate-in ios-stagger-1 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos Orçamentos
            </h2>
            {quotes.data && quotes.data.length > 0 && (
              <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {quotes.data.length}
              </span>
            )}
          </div>

          {!quotes.data ? (
            <div className="rounded-3xl bg-white dark:bg-zinc-900 p-8 text-center border border-black/5 dark:border-white/10">
              <p className="text-xs text-muted-foreground">Carregando históricos...</p>
            </div>
          ) : quotes.data.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-zinc-900 p-8 text-center space-y-2 border border-black/5 dark:border-white/10">
              <p className="text-sm font-semibold text-foreground">Nenhum orçamento criado ainda</p>
              <p className="text-xs text-muted-foreground">
                Clique no botão abaixo para tirar uma foto do PDV e começar.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-3xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 shadow-xs divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {quotes.data.map((quote) => (
                <QuoteListItem key={quote.id} quote={quote} storeId={store.data?.id} />
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Floating Glass Bottom Toolbar */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md safe-bottom glass-footer px-5 pt-3.5 pb-5">
        <Link
          to="/novo"
          search={{ loja: store.data?.id ?? "", id: undefined }}
          disabled={!store.data}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-raised ios-press active:scale-[0.97] aria-disabled:opacity-50"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
          <span>Novo Orçamento</span>
        </Link>
      </div>
    </div>
  );
}

function QuoteListItem({ quote, storeId }: { quote: any; storeId: string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const status = statusStyle[quote.status] ?? {
    label: quote.status,
    bg: "bg-zinc-100 dark:bg-zinc-800",
    text: "text-zinc-600 dark:text-zinc-400",
  };

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir este orçamento?")) return;
    setDeleting(true);

    try {
      await supabase.from("quote_items").delete().eq("quote_id", quote.id);
      const { error } = await supabase.from("quotes").delete().eq("id", quote.id);

      if (error) {
        toast.error("Erro ao apagar: " + error.message);
      } else {
        toast.success("Orçamento removido com sucesso");
        qc.invalidateQueries({ queryKey: ["quotes", "recent"] });
      }
    } finally {
      setDeleting(false);
    }
  }

  const formattedDate = new Date(quote.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex flex-col transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
      <div
        className="flex items-center justify-between px-4 py-3.5 cursor-pointer select-none ios-press"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-foreground tracking-tight">
            {formattedDate}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {quote.quote_items?.length ?? 0} {quote.quote_items?.length === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-bold text-foreground tracking-tight">
              R$ {formatBRL(Number(quote.total))}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.bg} ${status.text}`}>
              {status.label}
            </span>
          </div>

          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out ${
              expanded ? "rotate-90 text-primary" : ""
            }`}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Itens Registrados
            </span>
            <div className="flex items-center gap-2">
              <Link
                to="/novo"
                search={{ loja: storeId ?? "", id: quote.id }}
                disabled={!storeId}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary px-3 py-1.5 bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors ios-press active:scale-[0.95]"
              >
                <Edit3 className="h-3 w-3" />
                Editar
              </Link>
              <button
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1 text-xs font-semibold text-destructive px-3 py-1.5 bg-destructive/10 rounded-xl hover:bg-destructive/20 transition-colors disabled:opacity-50 ios-press active:scale-[0.95]"
              >
                <Trash2 className="h-3 w-3" />
                Apagar
              </button>
            </div>
          </div>

          {quote.quote_items?.length > 0 ? (
            <div className="space-y-2">
              {quote.quote_items.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white dark:bg-zinc-800 p-3 shadow-2xs border border-black/5 dark:border-white/5 space-y-1"
                >
                  <p className="text-xs font-semibold text-foreground leading-snug">
                    {item.product || "Produto sem nome"}
                  </p>
                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-0.5">
                    <span>
                      {item.quantity}x R$ {formatBRL(Number(item.unit_price))}
                    </span>
                    <span className="font-bold text-foreground">
                      R$ {formatBRL(Number(item.total_price))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">Nenhum item salvo neste orçamento.</p>
          )}
        </div>
      )}
    </li>
  );
}

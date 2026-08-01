import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/quote-format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orçamentos PauliFest & Moda Fantasy" },
      {
        name: "description",
        content:
          "Fotografe a tela do PDV e gere a mensagem de orçamento pronta para o WhatsApp em segundos.",
      },
      { property: "og:title", content: "Orçamentos PauliFest & Moda Fantasy" },
      {
        property: "og:description",
        content:
          "Fotografe a tela do PDV e gere a mensagem de orçamento pronta para o WhatsApp em segundos.",
      },
    ],
  }),
  component: Home,
});

const statusLabel: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  pago: "Pago",
  separando: "Separando",
  concluido: "Concluído",
};

function Home() {
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, pix_key")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const quotes = useQuery({
    queryKey: ["quotes", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, total, status, created_at, stores(name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-5 pt-14 pb-8">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Balcão</p>
        <h1 className="mt-1 text-[2rem] leading-tight font-semibold tracking-tight">
          Orçamentos
        </h1>
      </header>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Escolha a loja
      </h2>

      <div className="space-y-3">
        {stores.isLoading &&
          [0, 1].map((i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-2xl bg-surface shadow-card"
            />
          ))}

        {stores.data?.map((store) => (
          <Link
            key={store.id}
            to="/novo"
            search={{ loja: store.id }}
            className="flex items-center justify-between rounded-2xl bg-surface px-5 py-6 shadow-card transition active:scale-[0.98]"
          >
            <span className="flex flex-col gap-1">
              <span className="text-lg font-semibold">{store.name}</span>
              {store.pix_key?.trim() ? (
                <span className="text-sm text-muted-foreground">
                  Pix: {store.pix_key}
                </span>
              ) : null}
            </span>
            <span className="text-2xl text-primary">›</span>
          </Link>
        ))}
      </div>

      {quotes.data && quotes.data.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Últimos orçamentos
          </h2>
          <ul className="overflow-hidden rounded-2xl bg-surface shadow-card">
            {quotes.data.map((quote) => (
              <li
                key={quote.id}
                className="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {(quote.stores as { name: string } | null)?.name ?? "Loja"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(quote.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-semibold">
                    R$ {formatBRL(Number(quote.total))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statusLabel[quote.status] ?? quote.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

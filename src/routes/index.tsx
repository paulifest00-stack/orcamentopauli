import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/quote-format";
import iconUrl from "/favicon.png?url";

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

const statusLabel: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  pago: "Pago",
  separando: "Separando",
  concluido: "Concluído",
};

function Home() {
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
        .select("id, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-5 pt-14 pb-32">
      <header className="mb-8 flex items-center gap-4">
        <img
          src={iconUrl}
          alt="Ícone do app de orçamentos PauliFest"
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl shadow-card"
        />
        <div>
          <p className="text-sm font-medium text-muted-foreground">Balcão</p>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            PauliFest
          </h1>
        </div>
      </header>

      <div className="rounded-2xl bg-surface px-5 py-6 shadow-card">
        <p className="text-sm text-muted-foreground">
          Tire fotos da tela do PDV e a IA monta a mensagem do orçamento.
        </p>
        {store.data?.pix_key?.trim() ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Pix: <span className="font-medium text-foreground">{store.data.pix_key}</span>
          </p>
        ) : null}
      </div>

      {quotes.data && quotes.data.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Últimos orçamentos
          </h2>
          <ul className="overflow-hidden rounded-2xl bg-surface shadow-card">
            {quotes.data.map((quote) => (
              <li
                key={quote.id}
                className="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(quote.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md px-5 pb-6 pt-4">
        <Link
          to="/novo"
          search={{ loja: store.data?.id ?? "" }}
          disabled={!store.data}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-card transition active:scale-[0.98] aria-disabled:opacity-50"
        >
          Novo orçamento
        </Link>
      </div>
    </main>
  );
}

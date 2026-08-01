import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractQuote } from "@/lib/ocr.functions";
import {
  buildMessage,
  formatBRL,
  parseBRL,
  quoteTotal,
  type QuoteItem,
} from "@/lib/quote-format";

export const Route = createFileRoute("/novo")({
  validateSearch: (search: Record<string, unknown>) => ({
    loja: typeof search["loja"] === "string" ? search["loja"] : "",
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Novo orçamento | Balcão" },
      {
        name: "description",
        content:
          "Fotografe a tela do PDV, revise os itens lidos pela IA e copie a mensagem pronta do orçamento.",
      },
      { property: "og:title", content: "Novo orçamento | Balcão" },
      {
        property: "og:description",
        content:
          "Fotografe a tela do PDV, revise os itens e copie a mensagem pronta.",
      },
    ],
  }),
  component: NewQuote,
});

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler a foto"));
    reader.readAsDataURL(file);
  });
}

function NewQuote() {
  const { loja, id } = Route.useSearch();
  const runExtract = useServerFn(extractQuote);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [items, setItems] = useState<QuoteItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const store = useQuery({
    queryKey: ["store", loja],
    enabled: Boolean(loja),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, pix_key")
        .eq("id", loja)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useQuery({
    queryKey: ["quote", id],
    enabled: Boolean(id) && !items,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_items(id, product, quantity, unit_price, total_price)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (data?.quote_items) {
        const mapped = data.quote_items.map((item) => ({
          id: item.id,
          product: item.product ?? "",
          quantity: item.quantity ?? 1,
          unitPrice: Number(item.unit_price ?? 0),
          totalPrice: Number(item.total_price ?? 0),
        }));
        setItems(mapped);
      }
      return data;
    },
  });

  const total = useMemo(() => quoteTotal(items ?? []), [items]);

  const message = useMemo(
    () =>
      store.data && items
        ? buildMessage({
            storeName: store.data.name,
            pixKey: store.data.pix_key ?? "",
            items,
            total,
          })
        : "",
    [store.data, items, total],
  );

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const encoded = await Promise.all(Array.from(files).slice(0, 6).map(readFile));
    setPhotos((prev) => [...prev, ...encoded].slice(0, 12));
    if (items) void analyse(encoded, true);
  }

  async function analyse(source?: string[], append = false) {
    const target = source ?? photos;
    if (!target.length) return;
    setLoading(true);
    try {
      const result = await runExtract({ data: { images: target.slice(0, 6) } });
      if (!result.items.length) {
        toast.error("Nenhum item encontrado nas fotos.");
        return;
      }
      const mapped = result.items.map((item, index) => ({
        id: `${Date.now()}-${index}-${item.product}`,
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));
      setItems((prev) => (append && prev ? [...prev, ...mapped] : mapped));
      setCopied(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível ler as fotos.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateItem(id: string, patch: Partial<QuoteItem>) {
    setCopied(false);
    setItems((prev) =>
      (prev ?? []).map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
          next.totalPrice = next.quantity * next.unitPrice;
        }
        return next;
      }),
    );
  }

  async function copyMessage() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      toast.error("Não foi possível copiar. Segure na prévia para copiar.");
      return;
    }
    setCopied(true);
    toast.success("Mensagem copiada!");
    void saveQuote();
  }

  async function saveQuote() {
    if (!store.data || !items || saving) return;
    setSaving(true);
    try {
      let quoteId = id;
      if (id) {
        const { error } = await supabase
          .from("quotes")
          .update({ total, status: "enviado" })
          .eq("id", id);
        if (error) throw error;
        await supabase.from("quote_items").delete().eq("quote_id", id);
      } else {
        const { data: quote, error } = await supabase
          .from("quotes")
          .insert({ store_id: store.data.id, total, status: "enviado" })
          .select("id")
          .single();
        if (error) throw error;
        quoteId = quote.id;
      }

      const { error: itemsError } = await supabase.from("quote_items").insert(
        items.map((item, index) => ({
          quote_id: quoteId,
          product: item.product,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          position: index,
        })),
      );
      if (itemsError) throw itemsError;
    } catch {
      // salvamento silencioso: a mensagem já foi copiada
    } finally {
      setSaving(false);
    }
  }

  if (!loja || (store.isFetched && !store.data)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-5">
        <p className="text-muted-foreground">Loja não encontrada.</p>
        <Link to="/" className="font-semibold text-primary">
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-5 pt-12 pb-40">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/" className="text-2xl leading-none text-primary">
          ‹
        </Link>
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {store.data?.name ?? "Carregando…"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {items ? "Revisar orçamento" : "Novo orçamento"}
          </h1>
        </div>
      </div>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => {
          void addPhotos(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addPhotos(event.target.files);
          event.target.value = "";
        }}
      />

      {!items && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tire fotos da tela do PDV ou escolha imagens da galeria. A IA lê os
            itens automaticamente.
          </p>

          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface py-12 shadow-card transition active:scale-[0.98]"
          >
            <span className="text-3xl">📷</span>
            <span className="font-semibold text-primary">Tirar foto</span>
            <span className="text-xs text-muted-foreground">
              Você pode adicionar várias fotos
            </span>
          </button>

          <button
            type="button"
            onClick={() => galleryInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-4 font-semibold text-primary shadow-card transition active:scale-[0.98]"
          >
            🖼️ Escolher da galeria
          </button>


          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, index) => (
                <div
                  key={index}
                  className="relative aspect-3/4 overflow-hidden rounded-xl bg-surface shadow-card"
                >
                  <img
                    src={photo}
                    alt={`Foto ${index + 1} da tela do PDV`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remover foto"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-foreground/70 text-xs text-background"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {items && (
        <section className="space-y-6">
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="space-y-3 rounded-2xl bg-surface p-4 shadow-card"
              >
                <input
                  value={item.product}
                  onChange={(event) =>
                    updateItem(item.id, { product: event.target.value })
                  }
                  aria-label="Produto"
                  className="w-full rounded-xl bg-muted px-3 py-3 text-base font-medium outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Qtd</span>
                    <input
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.id, {
                          quantity: Math.max(
                            1,
                            Number.parseInt(event.target.value, 10) || 1,
                          ),
                        })
                      }
                      className="rounded-xl bg-muted px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      Unitário
                    </span>
                    <input
                      inputMode="decimal"
                      value={formatBRL(item.unitPrice)}
                      onChange={(event) =>
                        updateItem(item.id, {
                          unitPrice: parseBRL(event.target.value),
                        })
                      }
                      className="rounded-xl bg-muted px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      Total
                    </span>
                    <input
                      inputMode="decimal"
                      value={formatBRL(item.totalPrice)}
                      onChange={(event) =>
                        updateItem(item.id, {
                          totalPrice: parseBRL(event.target.value),
                        })
                      }
                      className="rounded-xl bg-muted px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setItems(
                      (prev) => prev?.filter((entry) => entry.id !== item.id) ?? [],
                    )
                  }
                  className="text-xs font-medium text-destructive"
                >
                  Remover item
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setCopied(false);
                setItems((prev) => [
                  ...(prev ?? []),
                  {
                    id: `manual-${Date.now()}`,
                    product: "",
                    quantity: 1,
                    unitPrice: 0,
                    totalPrice: 0,
                  },
                ]);
              }}
              className="w-full rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-primary"
            >
              + Adicionar item
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => cameraInput.current?.click()}
                className="rounded-2xl bg-surface py-3 text-sm font-semibold text-primary shadow-card disabled:opacity-40"
              >
                📷 Mais fotos
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => galleryInput.current?.click()}
                className="rounded-2xl bg-surface py-3 text-sm font-semibold text-primary shadow-card disabled:opacity-40"
              >
                🖼️ Galeria
              </button>
            </div>
            {loading && (
              <p className="text-center text-xs text-muted-foreground">
                Lendo as novas fotos…
              </p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              Prévia da mensagem
            </h2>
            <div className="rounded-2xl bg-bubble px-4 py-3 shadow-card">
              <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-bubble-foreground select-all">
                {message}
              </pre>
            </div>
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md safe-bottom bg-linear-to-t from-background via-background to-transparent px-5 pt-6">
        {!items ? (
          <button
            type="button"
            disabled={!photos.length || loading}
            onClick={() => void analyse()}
            className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-raised transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? "Lendo as fotos…" : "Ler com IA"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!items.length}
            onClick={() => void copyMessage()}
            className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-raised transition active:scale-[0.98] disabled:opacity-40"
          >
            {copied
              ? "✓ Copiado — pode continuar editando"
              : `Copiar mensagem · R$ ${formatBRL(total)}`}
          </button>
        )}
      </div>

    </main>
  );
}

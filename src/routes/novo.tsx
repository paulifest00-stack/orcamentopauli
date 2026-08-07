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
import { IOSStepper } from "@/components/ui/ios-stepper";
import {
  ChevronLeft,
  Camera,
  Image as ImageIcon,
  Sparkles,
  Copy,
  Check,
  Plus,
  Trash2,
  X,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

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
  const [orderNumber] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());

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
        .eq("id", id ?? "")
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
            orderNumber,
          })
        : "",
    [store.data, items, total, orderNumber],
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
      toast.success(`${mapped.length} ${mapped.length === 1 ? 'item identificado' : 'itens identificados'} pela IA!`);
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
    toast.success("Mensagem copiada para o WhatsApp!");
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
          quote_id: quoteId as string,
          product: item.product,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          position: index,
        })),
      );
      if (itemsError) throw itemsError;
    } catch {
      // salvamento silencioso
    } finally {
      setSaving(false);
    }
  }

  if (!loja || (store.isFetched && !store.data)) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] dark:bg-black flex items-center justify-center p-5">
        <div className="text-center space-y-4 rounded-3xl bg-white dark:bg-zinc-900 p-8 shadow-xs border border-black/5 dark:border-white/10 max-w-sm">
          <p className="text-sm text-muted-foreground">Loja não encontrada.</p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground ios-press active:scale-[0.95]"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-black text-foreground antialiased selection:bg-primary/20 pb-36">
      {/* Sticky iOS Top Header */}
      <header className="sticky top-0 z-30 glass-header px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary ios-press active:scale-[0.95]"
          >
            <ChevronLeft className="h-5 w-5 stroke-[2.5]" />
            <span>Voltar</span>
          </Link>

          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {store.data?.name ?? "Carregando…"}
            </p>
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              {items ? "Revisar Orçamento" : "Novo Orçamento"}
            </h1>
          </div>

          <div className="w-12" /> {/* Layout balancer */}
        </div>
      </header>

      {/* Hidden inputs */}
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

      <main className="mx-auto max-w-md px-4 pt-4 space-y-6">
        {/* Step 1: Upload Photos */}
        {!items && (
          <section className="ios-animate-in space-y-4">
            <div className="rounded-3xl bg-white dark:bg-zinc-900 p-5 shadow-xs border border-black/5 dark:border-white/10 space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                Fotos da Tela do PDV <Sparkles className="h-4 w-4 text-amber-500 fill-amber-500/20" />
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tire fotos da tela do computador ou caixa registradora. A Inteligência Artificial vai ler os produtos e preços.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-white dark:bg-zinc-900 p-6 text-center shadow-xs border border-black/5 dark:border-white/10 ios-press active:scale-[0.96] group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-active:bg-primary group-active:text-white transition-colors">
                  <Camera className="h-6 w-6" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-foreground">Tirar Foto</span>
                  <span className="block text-[11px] text-muted-foreground">Usar Câmera</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-white dark:bg-zinc-900 p-6 text-center shadow-xs border border-black/5 dark:border-white/10 ios-press active:scale-[0.96] group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-active:bg-purple-600 group-active:text-white transition-colors">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-foreground">Galeria</span>
                  <span className="block text-[11px] text-muted-foreground">Escolher Fotos</span>
                </div>
              </button>
            </div>

            {/* Uploaded Photos Grid */}
            {photos.length > 0 && (
              <div className="ios-animate-in space-y-2 pt-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fotos Selecionadas ({photos.length})
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {photos.map((photo, index) => (
                    <div
                      key={index}
                      className="relative aspect-3/4 overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 shadow-xs border border-black/5 dark:border-white/10 group"
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
                        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform active:scale-[0.88]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Step 2: Review & Edit Items */}
        {items && (
          <section className="ios-animate-in space-y-5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Itens do Orçamento ({items.length})
              </h2>
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
                className="inline-flex items-center gap-1 text-xs font-bold text-primary ios-press active:scale-[0.95]"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Adicionar Item</span>
              </button>
            </div>

            {/* List of Edit Cards */}
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl bg-white dark:bg-zinc-900 p-4 shadow-xs border border-black/5 dark:border-white/10 space-y-3"
                >
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Produto
                    </label>
                    <input
                      value={item.product}
                      onChange={(event) =>
                        updateItem(item.id, { product: event.target.value })
                      }
                      placeholder="Nome do produto..."
                      aria-label="Produto"
                      className="w-full rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>

                  <div className="space-y-3">
                    {/* Stepper Qtd */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Qtd
                      </label>
                      <IOSStepper
                        value={item.quantity}
                        onChange={(newQty) => updateItem(item.id, { quantity: newQty })}
                        className="w-full justify-between"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Unit Price */}
                      <div className="min-w-0 space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Unit. (R$)
                        </label>
                        <input
                          inputMode="decimal"
                          value={formatBRL(item.unitPrice)}
                          onChange={(event) =>
                            updateItem(item.id, {
                              unitPrice: parseBRL(event.target.value),
                            })
                          }
                          aria-label="Valor unitário"
                          className="w-full min-w-0 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 px-3 py-2.5 text-base font-semibold tabular-nums text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>

                      {/* Total Price */}
                      <div className="min-w-0 space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Total (R$)
                        </label>
                        <input
                          inputMode="decimal"
                          value={formatBRL(item.totalPrice)}
                          onChange={(event) =>
                            updateItem(item.id, {
                              totalPrice: parseBRL(event.target.value),
                            })
                          }
                          aria-label="Valor total"
                          className="w-full min-w-0 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 px-3 py-2.5 text-base font-bold tabular-nums text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </div>


                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setItems(
                          (prev) => prev?.filter((entry) => entry.id !== item.id) ?? [],
                        )
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-destructive/90 hover:text-destructive ios-press active:scale-[0.95]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add More Photos Row */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => cameraInput.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white dark:bg-zinc-900 py-3 px-4 text-xs font-bold text-primary shadow-xs border border-black/5 dark:border-white/10 ios-press active:scale-[0.96] disabled:opacity-40"
              >
                <Camera className="h-4 w-4" />
                <span>+ Fotos Câmera</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => galleryInput.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white dark:bg-zinc-900 py-3 px-4 text-xs font-bold text-primary shadow-xs border border-black/5 dark:border-white/10 ios-press active:scale-[0.96] disabled:opacity-40"
              >
                <ImageIcon className="h-4 w-4" />
                <span>+ Fotos Galeria</span>
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Processando fotos com a IA…</span>
              </div>
            )}

            {/* WhatsApp Message Chat Bubble Preview */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Prévia da Mensagem (WhatsApp)</span>
                </h2>
              </div>

              <div className="rounded-3xl bg-[#DCF8C6] dark:bg-[#054740] p-4.5 shadow-xs border border-emerald-500/20 text-[#111111] dark:text-[#E9EDEF]">
                <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap select-all font-medium">
                  {message}
                </pre>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Fixed Sticky Glass Bottom CTA Bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md safe-bottom glass-footer px-5 pt-3.5 pb-5">
        {!items ? (
          <button
            type="button"
            disabled={!photos.length || loading}
            onClick={() => void analyse()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-raised ios-press active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Lendo as fotos…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                <span>Ler com IA ({photos.length} {photos.length === 1 ? 'foto' : 'fotos'})</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={!items.length}
            onClick={() => void copyMessage()}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground shadow-raised ios-press active:scale-[0.97] disabled:opacity-40 transition-colors ${
              copied ? "bg-emerald-600" : "bg-primary"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-5 w-5 stroke-[2.5]" />
                <span>Copiado para o WhatsApp</span>
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" />
                <span>Copiar Mensagem · R$ {formatBRL(total)}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

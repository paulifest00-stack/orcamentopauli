const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ExtractedItem = {
  product: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ExtractedQuote = {
  items: ExtractedItem[];
  total: number;
};

const SYSTEM_PROMPT = `Você lê capturas de tela de sistemas de PDV (ponto de venda) de lojas de fantasias e artigos de festa no Brasil.
Extraia TODOS os itens do pedido visíveis nas imagens.
Para cada item devolva: product (nome do produto), quantity (inteiro), unitPrice (valor unitário em número), totalPrice (valor total da linha em número).
Também devolva total: o valor total da venda.
Use ponto como separador decimal. Nunca invente itens. Se houver várias imagens, junte todos os itens sem duplicar.
Responda SOMENTE com JSON no formato: {"items":[{"product":"","quantity":1,"unitPrice":0,"totalPrice":0}],"total":0}`;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function extractQuoteFromImages(
  images: string[],
): Promise<ExtractedQuote> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "A IA de leitura de imagem não está configurada neste projeto.",
    );
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraia os itens e o total desta(s) tela(s) do PDV.",
            },
            ...images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[AI] leitura falhou [${response.status}]: ${body}`);
    if (response.status === 429) {
      throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    }
    if (response.status === 402) {
      throw new Error("Os créditos de IA do workspace acabaram.");
    }
    throw new Error(`Não foi possível ler as imagens (${response.status}).`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "{}";
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: { items?: unknown; total?: unknown } = {};
  try {
    parsed = JSON.parse(jsonText) as { items?: unknown; total?: unknown };
  } catch {
    throw new Error("A IA respondeu em um formato inesperado. Tente de novo.");
  }

  const items: ExtractedItem[] = Array.isArray(parsed.items)
    ? parsed.items.map((entry) => {
        const item = entry as Record<string, unknown>;
        const quantity = Math.max(1, Math.round(toNumber(item["quantity"])) || 1);
        const unitPrice = toNumber(item["unitPrice"]);
        const totalPrice = toNumber(item["totalPrice"]) || unitPrice * quantity;
        return {
          product: String(item["product"] ?? "").trim() || "Item",
          quantity,
          unitPrice: unitPrice || (quantity ? totalPrice / quantity : 0),
          totalPrice,
        };
      })
    : [];

  const total =
    toNumber(parsed.total) ||
    items.reduce((sum, item) => sum + item.totalPrice, 0);

  return { items, total };
}

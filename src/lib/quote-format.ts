export type QuoteItem = {
  id: string;
  product: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export function formatBRL(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseBRL(input: string): number {
  const cleaned = input
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function quoteTotal(items: QuoteItem[]): number {
  return items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
}

export function buildMessage(params: {
  storeName: string;
  pixKey: string;
  items: QuoteItem[];
  total: number;
  orderNumber?: string;
}): string {
  const blocks = params.items
    .map(
      (item) =>
        `• ${item.quantity}x ${item.product}\n   R$ ${formatBRL(item.unitPrice)} cada → R$ ${formatBRL(item.totalPrice)}`,
    )
    .join("\n\n");

  const pix = params.pixKey?.trim()
    ? `💳 Forma de pagamento:
Pix: ${params.pixKey.trim()}

`
    : "";

  const orderHeader = params.orderNumber 
    ? `🆔 *PEDIDO #${params.orderNumber}*\n\n`
    : "";

  const orderFooter = params.orderNumber
    ? `\n━━━━━━━━━━━━━━\n📢 *INFORMAÇÃO IMPORTANTE*\n\nNa hora da retirada, informe o número do pedido acima:\n📍 *PEDIDO #${params.orderNumber}*\n\n(A retirada é feita pelo número, não pelo nome.)\n━━━━━━━━━━━━━━\n\n`
    : "";

  return `🛍️ *${params.storeName}*
${orderHeader}
Segue o orçamento solicitado:

📦 Itens

${blocks}

━━━━━━━━━━━━━━
💰 *Total: R$ ${formatBRL(params.total)}*
━━━━━━━━━━━━━━

${orderFooter}${pix}Após a confirmação do pagamento, iniciaremos a separação do pedido.

Agradecemos a preferência! 😊`;
}

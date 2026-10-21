export interface FinancialConfig {
  imposto: number; // % (ex: 6% MEI/Simples)
  taxaPagamento: number; // % (ex: 3.99% Cartão / 0% Pix)
  comissaoMarketplace: number; // % (ex: 18% ML / 14% Shopee)
  embalagem: number; // R$ (ex: 2.50 caixa/plástico bolha)
  outrosCustos: number; // R$ (ex: fita, adesivo, brinde)
  margemLucro: number; // % sobre o custo base (markup opcional)
  arredondamentoComercial?: boolean; // ex: terminar em .90
  repassarTaxas?: boolean; // Repassar taxas de marketplace ao preço final
  embalagemPorUnidade?: boolean; // Se true, multiplica embalagem pela quantidade
}

export interface PricingInput {
  custoProducao: number; // Custo de fabricação 3D (filamento + energia + desgaste + mão de obra)
  precoTabelaOriginal?: number; // Preço original da peça já com lucro embutido no catálogo
  quantidade?: number; // Quantidade de unidades (padrão: 1)
  embalagem?: number; // Custo de embalagem R$
  embalagemPorUnidade?: boolean; // Se true, multiplica embalagem pela quantidade
  outrosCustos?: number; // Outros insumos R$
  imposto?: number; // %
  taxaPagamento?: number; // %
  comissaoMarketplace?: number; // %
  margemLucro?: number; // % (apenas para modo manual do zero)
  arredondamentoComercial?: boolean;
  desconto?: number; // R$
  descontoPercentual?: number; // %
  repassarTaxas?: boolean; // Se true, recalcula o preço para absorver taxas sem perder o lucro da peça
}

export interface PricingBreakdown {
  quantidade: number;
  custoProducao: number;
  custoProducaoUnitario: number;
  embalagem: number;
  embalagemUnitaria: number;
  outrosCustos: number;
  custoBase: number;
  custoBaseUnitario: number;
  precoTabelaOriginal: number; // Preço original das peças (com lucro de catálogo)
  precoTabelaUnitario: number; // Preço original unitário
  precoSugeridoMarketplace: number; // Preço sugerido total com repasse de taxas
  precoSugeridoUnitario: number; // Preço sugerido por unidade com repasse de taxas
  margemLucro: number;
  lucroDesejado: number;
  subtotalNecessario: number;
  totalTaxasPercentual: number;
  impostoPercentual: number;
  impostoValor: number;
  taxaPagamentoPercentual: number;
  taxaPagamentoValor: number;
  marketplacePercentual: number;
  marketplaceValor: number;
  totalTaxasValor: number;
  precoBaseVenda: number; // Preço antes de descontos
  descontoValor: number;
  descontoPercentual: number;
  totalFinal: number; // Preço final efetivamente cobrado
  precoVenda: number; // Alias para totalFinal
  precoUnitarioFinal: number; // Preço final por unidade
  lucroLiquido: number; // Lucro líquido real total
  lucroLiquidoUnitario: number; // Lucro líquido real por unidade
  margemEfetiva: number; // % de lucro líquido sobre o valor cobrado
  lucroSobreCustoEfetivo: number; // % de lucro sobre o custo base
  alertaPrejuizo: boolean; // Flag indicando prejuízo (lucro < 0)
  alertaMargemBaixa: boolean; // Flag indicando margem < 15%
  repassouTaxas?: boolean;
  erro?: string;
}

/**
 * Sanitiza entradas numéricas para evitar NaN ou strings vazias
 */
export function sanitizeNumeric(value: number | string | undefined | null, defaultValue = 0): number {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  return Math.max(0, parsed);
}

/**
 * Aplica arredondamento comercial opcional para .90 caso ativado
 */
export function applyCommercialRounding(price: number, enabled: boolean): number {
  if (!enabled || price <= 0) {
    return Number(price.toFixed(2));
  }
  const floorVal = Math.floor(price);
  const candidate = floorVal + 0.90;
  return candidate >= price ? candidate : candidate + 1.0;
}

/**
 * Função central para auditoria de lucro líquido real e formação de preço de venda.
 * NÃO duplica lucro: se a peça já possui preço sugerido no catálogo, ela usa esse preço
 * e apenas deduz embalagem, taxas de meio de pagamento, comissão e impostos.
 */
export function calculateSalePrice(input: PricingInput): PricingBreakdown {
  const quantidade = Math.max(1, Math.round(sanitizeNumeric(input.quantidade, 1)));
  const custoProducao = sanitizeNumeric(input.custoProducao);
  const precoTabelaOriginal = sanitizeNumeric(input.precoTabelaOriginal);
  const embalagem = sanitizeNumeric(input.embalagem);
  const embalagemPorUnidade = input.embalagemPorUnidade !== undefined ? Boolean(input.embalagemPorUnidade) : true;
  const outrosCustos = sanitizeNumeric(input.outrosCustos);
  const imposto = sanitizeNumeric(input.imposto);
  const taxaPagamento = sanitizeNumeric(input.taxaPagamento);
  const comissaoMarketplace = sanitizeNumeric(input.comissaoMarketplace);
  const repassarTaxas = Boolean(input.repassarTaxas);
  const repassouTaxas = repassarTaxas;

  // Custos unitários de fabricação 3D
  const custoProducaoUnitario = Number((custoProducao / quantidade).toFixed(4));
  
  // Preço unitário base do produto (com lucro de catálogo se existir, ou custo + markup manual)
  const margemLucroManual = sanitizeNumeric(input.margemLucro, 80);
  let precoProdutoUnitarioBase: number;
  let lucroDesejadoUnitario: number;
  let margemLucroEfetiva: number;

  if (precoTabelaOriginal > 0) {
    precoProdutoUnitarioBase = Number((precoTabelaOriginal / quantidade).toFixed(4));
    lucroDesejadoUnitario = Math.max(0, precoProdutoUnitarioBase - custoProducaoUnitario);
    margemLucroEfetiva = custoProducaoUnitario > 0
      ? Number(((lucroDesejadoUnitario / custoProducaoUnitario) * 100).toFixed(1))
      : margemLucroManual;
  } else {
    lucroDesejadoUnitario = Number((custoProducaoUnitario * (margemLucroManual / 100)).toFixed(4));
    precoProdutoUnitarioBase = Number((custoProducaoUnitario + lucroDesejadoUnitario).toFixed(4));
    margemLucroEfetiva = margemLucroManual;
  }

  const margemLucro = margemLucroEfetiva;
  const precoTabelaUnitario = precoTabelaOriginal > 0 ? precoProdutoUnitarioBase : 0;
  const precoTabelaTotal = Number((precoProdutoUnitarioBase * quantidade).toFixed(2));

  // Embalagem e Insumos Operacionais
  const embalagemTotal = embalagemPorUnidade 
    ? Number((embalagem * quantidade).toFixed(4)) 
    : embalagem;
  const embalagemUnitaria = Number((embalagemTotal / quantidade).toFixed(4));

  const outrosCustosTotal = outrosCustos;
  const outrosCustosUnitario = Number((outrosCustosTotal / quantidade).toFixed(4));

  // 1. Custo base total e unitário
  const custoBase = Number((custoProducao + embalagemTotal + outrosCustosTotal).toFixed(4));
  const custoBaseUnitario = Number((custoBase / quantidade).toFixed(4));

  // 2. Taxas percentuais
  const totalTaxasPercentual = Number((imposto + taxaPagamento + comissaoMarketplace).toFixed(4));
  const divisor = 1 - (totalTaxasPercentual / 100);
  const fatorRepasse = divisor > 0 ? (1 / divisor) : 1;

  const lucroDesejado = Number((lucroDesejadoUnitario * quantidade).toFixed(4));
  const subtotalNecessario = Number((custoBase + lucroDesejado).toFixed(4));

  // Validação: taxas somadas não podem atingir ou exceder 100%
  if (totalTaxasPercentual >= 100) {
    return {
      quantidade,
      custoProducao: Number(custoProducao.toFixed(2)),
      custoProducaoUnitario: Number(custoProducaoUnitario.toFixed(2)),
      embalagem: Number(embalagemTotal.toFixed(2)),
      embalagemUnitaria: Number(embalagemUnitaria.toFixed(2)),
      outrosCustos: Number(outrosCustos.toFixed(2)),
      custoBase: Number(custoBase.toFixed(2)),
      custoBaseUnitario: Number(custoBaseUnitario.toFixed(2)),
      precoTabelaOriginal: Number(precoTabelaTotal.toFixed(2)),
      precoTabelaUnitario: Number(precoTabelaUnitario.toFixed(2)),
      precoSugeridoMarketplace: 0,
      precoSugeridoUnitario: 0,
      margemLucro: margemLucroEfetiva,
      lucroDesejado: Number(lucroDesejado.toFixed(2)),
      subtotalNecessario: Number(subtotalNecessario.toFixed(2)),
      totalTaxasPercentual,
      impostoPercentual: imposto,
      impostoValor: 0,
      taxaPagamentoPercentual: taxaPagamento,
      taxaPagamentoValor: 0,
      marketplacePercentual: comissaoMarketplace,
      marketplaceValor: 0,
      totalTaxasValor: 0,
      precoBaseVenda: 0,
      descontoValor: 0,
      descontoPercentual: 0,
      totalFinal: 0,
      precoVenda: 0,
      precoUnitarioFinal: 0,
      lucroLiquido: -custoBase,
      lucroLiquidoUnitario: -custoBaseUnitario,
      margemEfetiva: -100,
      lucroSobreCustoEfetivo: -100,
      alertaPrejuizo: true,
      alertaMargemBaixa: true,
      repassouTaxas: false,
      erro: 'A soma das taxas não pode ser igual ou superior a 100%.'
    };
  }

  // 3. Preço Sugerido para Marketplace:
  // O valor unitário do produto NUNCA baixa quando a quantidade sobe!
  // Se embalagem é por unidade, ela é incorporada no preço unitário de cada peça.
  // Se embalagem é por encomenda, ela é repassada como valor global da remessa.
  let precoSugeridoUnitarioSemArredondar: number;
  let precoSugeridoTotalSemArredondar: number;

  if (embalagemPorUnidade) {
    precoSugeridoUnitarioSemArredondar = (precoProdutoUnitarioBase + embalagemUnitaria + outrosCustosUnitario) * fatorRepasse;
    precoSugeridoTotalSemArredondar = precoSugeridoUnitarioSemArredondar * quantidade;
  } else {
    precoSugeridoUnitarioSemArredondar = precoProdutoUnitarioBase * fatorRepasse;
    const embalagemRepassada = (embalagemTotal + outrosCustosTotal) * fatorRepasse;
    precoSugeridoTotalSemArredondar = (precoSugeridoUnitarioSemArredondar * quantidade) + embalagemRepassada;
  }

  const precoSugeridoUnitario = applyCommercialRounding(precoSugeridoUnitarioSemArredondar, !!input.arredondamentoComercial);
  const precoSugeridoMarketplace = Number(
    applyCommercialRounding(precoSugeridoTotalSemArredondar, !!input.arredondamentoComercial).toFixed(2)
  );

  // 4. Determinação do Preço Base de Venda:
  let precoBaseVenda: number;
  let precoUnitarioBase: number;

  if (repassarTaxas) {
    precoUnitarioBase = precoSugeridoUnitario;
    precoBaseVenda = precoSugeridoMarketplace;
  } else {
    // Venda direta ou preço base da oficina (com embalagem inclusa ou adicionada)
    precoUnitarioBase = applyCommercialRounding(precoProdutoUnitarioBase + (embalagemPorUnidade ? embalagemUnitaria : 0), !!input.arredondamentoComercial);
    precoBaseVenda = Number(((precoUnitarioBase * quantidade) + (!embalagemPorUnidade ? embalagemTotal : 0)).toFixed(2));
  }

  // 5. Desconto comercial aplicado
  let descontoValor = 0;
  let descontoPercentual = 0;

  if (typeof input.descontoPercentual === 'number' && input.descontoPercentual > 0) {
    descontoPercentual = sanitizeNumeric(input.descontoPercentual);
    descontoValor = Number(((precoBaseVenda * descontoPercentual) / 100).toFixed(2));
  } else if (typeof input.desconto === 'number' && input.desconto > 0) {
    descontoValor = sanitizeNumeric(input.desconto);
    descontoPercentual = precoBaseVenda > 0 ? Number(((descontoValor / precoBaseVenda) * 100).toFixed(1)) : 0;
  }

  // Preço final cobrado do cliente
  const totalFinal = Math.max(0, Number((precoBaseVenda - descontoValor).toFixed(2)));
  const precoUnitarioFinal = quantidade > 0 ? Number((totalFinal / quantidade).toFixed(2)) : totalFinal;

  // 6. As taxas incidem sobre o valor REALMENTE COBRADO (totalFinal)
  const impostoValor = Number(((totalFinal * imposto) / 100).toFixed(2));
  const taxaPagamentoValor = Number(((totalFinal * taxaPagamento) / 100).toFixed(2));
  const marketplaceValor = Number(((totalFinal * comissaoMarketplace) / 100).toFixed(2));
  const totalTaxasValor = Number((impostoValor + taxaPagamentoValor + marketplaceValor).toFixed(2));

  // 7. Lucro Líquido Real que entra no bolso:
  // Total Cobrado - Custo Base (fabricação + embalagem + insumos) - Taxas e Impostos
  const totalSaidas = Number((custoBase + totalTaxasValor).toFixed(2));
  const lucroLiquido = Number((totalFinal - totalSaidas).toFixed(2));
  const lucroLiquidoUnitario = Number((lucroLiquido / quantidade).toFixed(2));

  // 8. Margem Efetiva Líquida sobre a Venda
  let margemEfetiva = 0;
  if (totalFinal > 0) {
    margemEfetiva = Number(((lucroLiquido / totalFinal) * 100).toFixed(1));
  } else if (custoBase > 0) {
    margemEfetiva = -100;
  }

  // 9. Lucro sobre o Custo Base
  const lucroSobreCustoEfetivo = custoBase > 0
    ? Number(((lucroLiquido / custoBase) * 100).toFixed(1))
    : (lucroLiquido >= 0 ? margemLucro : -100);

  const alertaPrejuizo = lucroLiquido < 0;
  const alertaMargemBaixa = !alertaPrejuizo && margemEfetiva < 15;

  return {
    quantidade,
    custoProducao: Number(custoProducao.toFixed(2)),
    custoProducaoUnitario: Number(custoProducaoUnitario.toFixed(2)),
    embalagem: Number(embalagemTotal.toFixed(2)),
    embalagemUnitaria: Number(embalagemUnitaria.toFixed(2)),
    outrosCustos: Number(outrosCustos.toFixed(2)),
    custoBase: Number(custoBase.toFixed(2)),
    custoBaseUnitario: Number(custoBaseUnitario.toFixed(2)),
    precoTabelaOriginal: Number(precoTabelaOriginal.toFixed(2)),
    precoTabelaUnitario: Number(precoTabelaUnitario.toFixed(2)),
    precoSugeridoMarketplace,
    precoSugeridoUnitario,
    margemLucro: Number(margemLucro.toFixed(1)),
    lucroDesejado: Number(lucroDesejado.toFixed(2)),
    subtotalNecessario: Number(subtotalNecessario.toFixed(2)),
    totalTaxasPercentual: Number(totalTaxasPercentual.toFixed(2)),
    impostoPercentual: Number(imposto.toFixed(2)),
    impostoValor,
    taxaPagamentoPercentual: Number(taxaPagamento.toFixed(2)),
    taxaPagamentoValor,
    marketplacePercentual: Number(comissaoMarketplace.toFixed(2)),
    marketplaceValor,
    totalTaxasValor,
    precoBaseVenda: Number(precoBaseVenda.toFixed(2)),
    descontoValor,
    descontoPercentual,
    totalFinal,
    precoVenda: totalFinal,
    precoUnitarioFinal,
    lucroLiquido,
    lucroLiquidoUnitario,
    margemEfetiva,
    lucroSobreCustoEfetivo,
    alertaPrejuizo,
    alertaMargemBaixa,
    repassouTaxas
  };
}

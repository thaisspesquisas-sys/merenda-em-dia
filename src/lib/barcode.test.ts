import { beforeEach, describe, expect, it } from "vitest";
import {
  BARCODE_EXIT_ORIGIN_LABEL,
  checkBarcodeConflict,
  findProductByBarcode,
  formatBarcodeExitObservacoes,
  isValidBarcodeFormat,
  linkBarcodeToProduct,
  parseBarcodeMovementMeta,
  saveProductBarcodes,
} from "./barcode";
import { computeSaldos, enrichProduto, type Movimento, type Produto } from "./estoque";

const feijao: Produto = {
  id: "prod-feijao",
  nome: "Feijão Carioca Tipo 1",
  unidade: "kg",
  unidade_apresentacao: "pacote",
  categoria: "Cereais",
  origem_padrao: "mercado",
  ativo: true,
  estoque_minimo: 10,
};

const arroz: Produto = {
  id: "prod-arroz",
  nome: "Arroz Branco Tipo 1",
  unidade: "kg",
  unidade_apresentacao: "kg",
  categoria: "Cereais",
  origem_padrao: "mercado",
  ativo: true,
  estoque_minimo: 15,
};

const oleo: Produto = {
  id: "prod-oleo",
  nome: "Óleo de Soja 900ml",
  unidade: "un",
  unidade_apresentacao: "un",
  categoria: "Mercearia",
  origem_padrao: "mercado",
  ativo: true,
  estoque_minimo: 5,
};

describe("Leitor de Código de Barras e Múltiplos Códigos Vinculados por Produto", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("1. Valida leitura de códigos EAN-13, EAN-8, UPC-A, UPC-E e CODE-128", () => {
    expect(isValidBarcodeFormat("7891000100103")).toEqual({
      valid: true,
      format: "EAN-13",
    });
    expect(isValidBarcodeFormat("78912345")).toEqual({
      valid: true,
      format: "EAN-8",
    });
    expect(isValidBarcodeFormat("012345678905")).toEqual({
      valid: true,
      format: "UPC-A",
    });
    expect(isValidBarcodeFormat("")).toMatchObject({ valid: false });
  });

  it("2. Permite vincular múltiplos códigos de barras (marcas A, B e C) a um único produto e identifica automaticamente o produto principal", () => {
    const catalogo = [feijao, arroz, oleo];

    const r1 = linkBarcodeToProduct({
      productId: feijao.id,
      codigo: "7891111111111",
      marca_apresentacao: "Marca A - Pacote 1kg",
      principal: true,
      responsavel: "Maria Merendeira",
      produtos: catalogo,
    });
    expect(r1.ok).toBe(true);

    const r2 = linkBarcodeToProduct({
      productId: feijao.id,
      codigo: "7892222222222",
      marca_apresentacao: "Marca B - Pacote 1kg",
      responsavel: "Maria Merendeira",
      produtos: catalogo,
    });
    expect(r2.ok).toBe(true);

    const r3 = linkBarcodeToProduct({
      productId: feijao.id,
      codigo: "7893333333333",
      marca_apresentacao: "Marca C - Embalagem equivalente",
      responsavel: "Maria Merendeira",
      produtos: catalogo,
    });
    expect(r3.ok).toBe(true);
    expect(r3.barcodes?.length).toBe(3);

    const enrichedCatalogo = catalogo.map(enrichProduto);

    // Qualquer um dos 3 códigos deve localizar o mesmo produto principal (Feijão)
    const buscaA = findProductByBarcode("7891111111111", enrichedCatalogo);
    const buscaB = findProductByBarcode("7892222222222", enrichedCatalogo);
    const buscaC = findProductByBarcode("7893333333333", enrichedCatalogo);

    expect(buscaA?.produto.id).toBe(feijao.id);
    expect(buscaA?.vinculo.principal).toBe(true);
    expect(buscaB?.produto.id).toBe(feijao.id);
    expect(buscaB?.vinculo.marca_apresentacao).toBe("Marca B - Pacote 1kg");
    expect(buscaC?.produto.id).toBe(feijao.id);
  });

  it("3. Impede que o mesmo código de barras seja vinculado a dois produtos diferentes com a mensagem obrigatória", () => {
    saveProductBarcodes(feijao.id, [
      { codigo: "7891000100103", principal: true, marca_apresentacao: "Marca A" },
    ]);
    const catalogo = [feijao, arroz].map(enrichProduto);

    const conflict = checkBarcodeConflict("7891000100103", catalogo, arroz.id);
    expect(conflict.conflict).toBe(true);
    expect(conflict.message).toBe(
      "ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO: FEIJÃO CARIOCA TIPO 1.",
    );

    const linkAttempt = linkBarcodeToProduct({
      productId: arroz.id,
      codigo: "7891000100103",
      produtos: catalogo,
    });
    expect(linkAttempt.ok).toBe(false);
    expect(linkAttempt.error).toBe(
      "ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO: FEIJÃO CARIOCA TIPO 1.",
    );
  });

  it("4. Retorna null para código não encontrado sem cadastrar produtos desconhecidos automaticamente", () => {
    const catalogo = [feijao, arroz].map(enrichProduto);
    const resultado = findProductByBarcode("7899999999999", catalogo);
    expect(resultado).toBeNull();
  });

  it("5. Registra saídas consecutivas por código de barras, atualiza o saldo corretamente e preserva rastreabilidade no histórico", () => {
    const movsIniciais: Movimento[] = [
      {
        id: "m1",
        school_id: "escola-1",
        product_id: arroz.id,
        tipo: "entrada",
        data: "2026-11-01",
        quantidade: 20,
        origem: "mercado",
      },
      {
        id: "m2",
        school_id: "escola-1",
        product_id: feijao.id,
        tipo: "entrada",
        data: "2026-11-01",
        quantidade: 15,
        origem: "agricultura",
      },
      {
        id: "m3",
        school_id: "escola-1",
        product_id: oleo.id,
        tipo: "entrada",
        data: "2026-11-01",
        quantidade: 10,
        origem: "mercado",
      },
    ];

    const saldosAntes = computeSaldos(movsIniciais);
    expect(saldosAntes.get(arroz.id)?.total).toBe(20);
    expect(saldosAntes.get(feijao.id)?.total).toBe(15);
    expect(saldosAntes.get(oleo.id)?.total).toBe(10);

    // Simula baixa consecutiva por código de barras: Arroz 5kg, Feijão 3kg, Óleo 4 un
    const obsArroz = formatBarcodeExitObservacoes({
      codigoBarras: "7891000000011",
      saldoAnterior: 20,
      saldoPosterior: 15,
      horario: "08:15:00",
    });
    const obsFeijao = formatBarcodeExitObservacoes({
      codigoBarras: "7892222222222",
      saldoAnterior: 15,
      saldoPosterior: 12,
      horario: "08:15:05",
    });
    const obsOleo = formatBarcodeExitObservacoes({
      codigoBarras: "7893000000033",
      saldoAnterior: 10,
      saldoPosterior: 6,
      horario: "08:15:10",
    });

    const movsAposSaidaRapida: Movimento[] = [
      ...movsIniciais,
      {
        id: "s1",
        school_id: "escola-1",
        product_id: arroz.id,
        tipo: "saida",
        data: "2026-11-06",
        quantidade: 5,
        origem: "mercado",
        destino: `Preparação de Almoço — ${BARCODE_EXIT_ORIGIN_LABEL}`,
        responsavel: "João Estoquista",
        observacoes: obsArroz,
      },
      {
        id: "s2",
        school_id: "escola-1",
        product_id: feijao.id,
        tipo: "saida",
        data: "2026-11-06",
        quantidade: 3,
        origem: "agricultura",
        destino: `Preparação de Almoço — ${BARCODE_EXIT_ORIGIN_LABEL}`,
        responsavel: "João Estoquista",
        observacoes: obsFeijao,
      },
      {
        id: "s3",
        school_id: "escola-1",
        product_id: oleo.id,
        tipo: "saida",
        data: "2026-11-06",
        quantidade: 4,
        origem: "mercado",
        destino: `Preparação de Almoço — ${BARCODE_EXIT_ORIGIN_LABEL}`,
        responsavel: "João Estoquista",
        observacoes: obsOleo,
      },
    ];

    const saldosDepois = computeSaldos(movsAposSaidaRapida);
    expect(saldosDepois.get(arroz.id)?.total).toBe(15);
    expect(saldosDepois.get(feijao.id)?.total).toBe(12);
    expect(saldosDepois.get(oleo.id)?.total).toBe(6);

    // Verifica metadados extraídos para histórico e relatórios
    const metaFeijao = parseBarcodeMovementMeta(movsAposSaidaRapida[4]!);
    expect(metaFeijao.isBarcodeExit).toBe(true);
    expect(metaFeijao.origemMovimentacaoLabel).toBe("Saída por código de barras");
    expect(metaFeijao.codigoBarras).toBe("7892222222222");
    expect(metaFeijao.saldoAnterior).toBe(15);
    expect(metaFeijao.saldoPosterior).toBe(12);
    expect(metaFeijao.horario).toBe("08:15:05");
  });
});

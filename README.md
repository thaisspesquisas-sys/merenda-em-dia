# Merenda em Dia

DESENVOLVIMENTO DE APLICATIVO – SISTEMA DE CONTROLE DE ESTOQUE DA MERENDA ESCOLAR

Desenvolva um aplicativo web responsivo, moderno e intuitivo para gerenciamento e controle de estoque dos alimentos destinados à merenda escolar das unidades de ensino.

Nome provisório: Gestão da Merenda Escolar.

Objetivo: Controlar o recebimento, a origem, a movimentação e o consumo dos alimentos, mantendo um estoque atualizado automaticamente e permitindo a emissão de relatórios mensais para impressão e prestação de contas.

1. CADASTRO DE PRODUTOS

Criar uma área para cadastrar todos os alimentos utilizados na merenda escolar.

Cada produto deverá possuir os seguintes campos:

- Nome do alimento/produto.
- Unidade de medida: quilograma (kg), litro (L) ou unidade.
- Categoria do alimento (carnes, frutas, verduras, legumes, cereais, laticínios, mercearia etc.).
- Origem de fornecimento:
  - Mercado/Fornecedor comercial.
  - Agricultura Familiar.
- Status: ativo ou inativo.

Após o cadastro, os produtos deverão ficar armazenados em uma lista geral de produtos cadastrados.

Permitir:

- Cadastrar novos produtos.
- Editar produtos existentes.
- Excluir produtos, desde que não comprometa o histórico de movimentações.
- Pesquisar produtos pelo nome.
- Filtrar por categoria e unidade de medida.

A origem deverá ser registrada em cada movimentação, pois um mesmo alimento poderá ser adquirido tanto no mercado quanto da agricultura familiar.

2. CONTROLE DE ENTRADA DE ALIMENTOS

Criar uma tela específica para registrar a entrada dos alimentos no estoque.

Campos obrigatórios:

- Data da entrada.
- Produto (selecionar da lista de produtos cadastrados).
- Quantidade recebida.
- Unidade de medida automática, conforme cadastro.
- Origem do produto:
  - Mercado.
  - Agricultura Familiar.
- Nome do fornecedor (opcional).
- Número da nota fiscal ou documento (opcional).
- Observações.

Ao confirmar a entrada, o sistema deverá:

1. Registrar automaticamente a movimentação.
2. Atualizar o estoque do produto.
3. Separar contabilmente as quantidades recebidas do mercado e da agricultura familiar.
4. Atualizar a planilha de estoque.
5. Manter o histórico de todas as entradas realizadas.

3. CONTROLE DE SAÍDA DE ALIMENTOS

Criar uma tela para registrar as saídas dos produtos utilizados na preparação da merenda escolar.

Campos:

- Data da saída.
- Produto.
- Quantidade retirada.
- Unidade de medida.
- Destino ou finalidade (opcional).
- Responsável pelo registro.
- Observações.

Funcionamento automático:

- Ao registrar uma saída, o sistema deverá descontar imediatamente a quantidade do estoque.
- Calcular automaticamente o saldo restante.
- Impedir que seja registrada uma saída superior à quantidade disponível.
- Atualizar a planilha de estoque em tempo real.
- Guardar o histórico das saídas.

O sistema deverá permitir consultar todas as saídas por produto, período e mês.

4. PAINEL PRINCIPAL – ESTOQUE ATUAL

Criar um painel visual com:

- Quantidade total de produtos cadastrados.
- Quantidade total de alimentos em estoque.
- Total recebido do mercado.
- Total recebido da agricultura familiar.
- Total de saídas no mês.
- Produtos com estoque baixo.
- Produtos sem estoque.

Criar uma tabela de estoque com as seguintes colunas:

Produto| Unidade| Mercado| Agricultura Familiar| Total disponível

Os valores deverão ser atualizados automaticamente a cada entrada e saída.

5. FECHAMENTO E PLANILHA MENSAL DE ESTOQUE

Esta é uma das funcionalidades mais importantes do aplicativo.

Desenvolver uma ferramenta de fechamento mensal que gere automaticamente uma planilha completa de movimentação dos alimentos.

A planilha deverá apresentar as seguintes colunas:

1. Nome do produto.
2. Unidade de medida (kg, L ou unidade).
3. Estoque do mês anterior – Mercado.
4. Estoque do mês anterior – Agricultura Familiar.
5. Total do estoque anterior.
6. Entrada do mês – Mercado.
7. Entrada do mês – Agricultura Familiar.
8. Total de entradas.
9. Saídas do mês.
10. Saldo final do mês – Mercado.
11. Saldo final do mês – Agricultura Familiar.
12. Total restante em estoque.

Cálculo automático

O sistema deverá calcular:

Estoque disponível:
Estoque anterior + Entradas do mês.

Saldo final:
Estoque anterior + Entradas - Saídas.

O sistema deverá manter a separação entre mercado e agricultura familiar durante todo o controle, permitindo identificar a origem dos alimentos ainda disponíveis.

Quando não houver informação suficiente para identificar a origem de uma saída, o sistema deverá permitir definir a origem da retirada no momento do registro.

Exemplo de planilha:

Produto| Estoque anterior| Entrada mercado| Entrada agricultura familiar| Saída| Saldo final
Arroz| 20 kg| 30 kg| 10 kg| 25 kg| 35 kg
Feijão| 15 kg| 20 kg| 5 kg| 18 kg| 22 kg
Leite| 10 L| 20 L| 0 L| 15 L| 15 L

Os valores acima são apenas ilustrativos.

A planilha deverá apresentar as quantidades separadas por origem, mesmo quando o produto for o mesmo.

6. TRANSFERÊNCIA AUTOMÁTICA ENTRE OS MESES

Ao finalizar um mês, o aplicativo deverá permitir realizar o fechamento mensal.

Quando iniciar o mês seguinte:

- O saldo final do mês anterior deverá ser automaticamente transferido para o campo de estoque anterior.
- Manter separadas as quantidades provenientes do mercado e da agricultura familiar.
- Iniciar o novo controle de entradas e saídas.
- Não apagar nem alterar os registros dos meses anteriores.
- Permitir consultar novamente qualquer fechamento mensal.

O sistema deverá impedir duplicidade de fechamento e permitir correções administrativas com registro de auditoria.

7. RELATÓRIOS E IMPRESSÃO

Criar uma área de relatórios com:

- Relatório mensal de estoque.
- Relatório de entradas.
- Relatório de saídas.
- Relatório de produtos disponíveis.
- Relatório de produtos provenientes da agricultura familiar.
- Relatório de produtos provenientes do mercado.
- Histórico de movimentação por produto.

Todos os relatórios deverão permitir:

- Selecionar o mês e o ano.
- Visualizar antes de imprimir.
- Imprimir em formato A4.
- Exportar para PDF.
- Exportar para Excel.

Layout da planilha mensal

Criar um documento profissional, organizado e adequado para arquivamento e prestação de contas da alimentação escolar.

Cabeçalho:

PREFEITURA MUNICIPAL
SECRETARIA MUNICIPAL DE EDUCAÇÃO
CONTROLE MENSAL DE ESTOQUE DA MERENDA ESCOLAR

Campos:

- Nome da unidade escolar.
- Mês de referência.
- Ano.
- Responsável pelo estoque.

No final da planilha, incluir:

- Data do fechamento.
- Espaço para assinatura do responsável pelo estoque.
- Espaço para assinatura da direção escolar.
- Observações.

8. CADASTRO DE UNIDADES ESCOLARES

Permitir cadastrar diferentes unidades escolares, caso o sistema seja utilizado pela Secretaria Municipal de Educação para acompanhar o estoque de várias escolas.

Cada escola deverá possuir seu próprio estoque, entradas, saídas e relatórios.

O administrador da Secretaria deverá conseguir visualizar os dados de todas as unidades.

9. USUÁRIOS E PERMISSÕES

Criar controle de acesso com os seguintes perfis:

Administrador da Secretaria de Educação:

- Acesso geral ao sistema.
- Cadastro de produtos e escolas.
- Consulta de todos os estoques.
- Consulta e emissão de relatórios.
- Gerenciamento de usuários.

Responsável pelo estoque da escola:

- Registrar entradas.
- Registrar saídas.
- Consultar estoque da própria escola.
- Emitir relatórios da própria unidade.

Diretor escolar:

- Consultar estoque.
- Visualizar movimentações.
- Emitir relatórios.
- Acompanhar os fechamentos mensais.

10. REQUISITOS TÉCNICOS IMPORTANTES

- Desenvolver utilizando banco de dados integrado e persistente.
- Atualizar o estoque automaticamente após cada movimentação.
- Registrar data, horário e usuário responsável por cada operação.
- Manter histórico completo de entradas, saídas e alterações.
- Não permitir estoque negativo.
- Garantir que os dados de cada escola sejam independentes.
- Permitir utilização pelo celular, tablet e computador.
- Interface em português brasileiro.
- Layout simples, profissional e intuitivo.
- Utilizar cores que facilitem a identificação das entradas, saídas e saldos.

11. REGRA FUNDAMENTAL DO SISTEMA

O aplicativo deverá funcionar como um controle de estoque real, e não apenas como uma planilha de preenchimento manual.

Toda entrada e saída deverá alimentar automaticamente o estoque e os relatórios.

O sistema deverá preservar a origem de cada quantidade recebida, distinguindo mercado e agricultura familiar, inclusive nos saldos transportados de um mês para outro.

RESULTADO ESPERADO:

Um sistema completo de controle da merenda escolar, que permita saber exatamente quais alimentos entraram, de onde vieram, quanto foi utilizado, quanto ainda existe em estoque e qual é o saldo mensal de cada produto, com relatórios organizados e prontos para impressão.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7e80df43-f946-4afa-94dd-2b9638153632).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

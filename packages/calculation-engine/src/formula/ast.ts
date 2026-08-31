export type BinaryFormulaOperator = 'add' | 'divide' | 'multiply' | 'subtract';
export type AggregateFormulaOperator = 'max' | 'min';
export type UnaryFormulaOperator = 'ceil' | 'floor' | 'round';
export type FormulaComparisonOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ne';

export interface LiteralFormulaNode {
  readonly denominator: string;
  readonly numerator: string;
  readonly type: 'literal';
}

export interface VariableFormulaNode {
  readonly name: string;
  readonly type: 'variable';
}

export interface BinaryFormulaNode {
  readonly left: FormulaNode;
  readonly right: FormulaNode;
  readonly type: BinaryFormulaOperator;
}

export interface AggregateFormulaNode {
  readonly operands: readonly FormulaNode[];
  readonly type: AggregateFormulaOperator;
}

export interface UnaryFormulaNode {
  readonly operand: FormulaNode;
  readonly type: UnaryFormulaOperator;
}

export interface CompareFormulaNode {
  readonly left: FormulaNode;
  readonly operator: FormulaComparisonOperator;
  readonly right: FormulaNode;
  readonly type: 'compare';
}

export interface ConditionalFormulaNode {
  readonly condition: CompareFormulaNode;
  readonly else: FormulaNode;
  readonly then: FormulaNode;
  readonly type: 'if';
}

export type FormulaNode =
  | AggregateFormulaNode
  | BinaryFormulaNode
  | ConditionalFormulaNode
  | LiteralFormulaNode
  | UnaryFormulaNode
  | VariableFormulaNode;

export type CodeTab = {
  id: string;
  label: string;
  code: string;
  lang: string;
};

export type NativeCodeBlock = {
  isCodeBlock: boolean;
  code: string;
  lang: string;
};

export type KernelResponse<T> = {
  code: number;
  msg: string;
  data: T;
};

export type BlockAttrs = Record<string, string>;

export type BlockOperation = {
  action: string;
  id?: string;
  data?: string;
  parentID?: string;
  previousID?: string;
  nextID?: string;
};

export type TransactionResult = {
  doOperations?: BlockOperation[];
  undoOperations?: BlockOperation[] | null;
};

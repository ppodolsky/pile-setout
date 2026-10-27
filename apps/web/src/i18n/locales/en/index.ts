import { cad } from './cad';
import { common } from './common';
import { design } from './design';
import { fieldwork } from './fieldwork';
import { project } from './project';

/** English — the source language; every other language must translate all of it. */
export const en = { common, cad, design, fieldwork, project } as const;

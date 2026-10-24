// Packages
import { z } from 'zod'

export const ModuleId = z.enum( [ 'transcriber', 'melete' ] )
export type ModuleId = z.infer< typeof ModuleId >

export const Role = z.enum( [ 'admin', 'member' ] )
export type Role = z.infer< typeof Role >

export const UserStatus = z.enum( [ 'active', 'removed' ] )
export type UserStatus = z.infer< typeof UserStatus >

// 1–40 characters, lower-case letters, digits and hyphens, no leading or trailing hyphen.
export const VaultDir = z.string().regex( /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/ )
export type VaultDir = z.infer< typeof VaultDir >

// For the admin, `modules` is always every ModuleId.
export const Me = z.object( {
  id: z.uuid(),
  email: z.email(),
  name: z.string().min( 1 ),
  role: Role,
  modules: z.array( ModuleId ),
  vault_dir: VaultDir.nullable(),
} )
export type Me = z.infer< typeof Me >

export const VaultChoice = z.object( {
  folders: z.array( VaultDir ),
} )
export type VaultChoice = z.infer< typeof VaultChoice >

export const ClaimVaultBody = z.object( {
  vault_dir: VaultDir,
} )
export type ClaimVaultBody = z.infer< typeof ClaimVaultBody >

export const CreateVaultBody = z.object( {
  vault_dir: VaultDir,
} )
export type CreateVaultBody = z.infer< typeof CreateVaultBody >

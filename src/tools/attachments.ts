import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraAttachment, JiraIssue, ToolResult } from '../types.js';

const listAttachmentsSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
});

const addAttachmentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
  filePath: z.string().min(1, 'filePath is required — absolute path to the local file to upload'),
  mimeType: z
    .string()
    .optional()
    .describe('MIME type override (e.g. "image/png"). Auto-detected from extension if omitted.'),
});

const deleteAttachmentSchema = z.object({
  attachmentId: z.string().min(1, 'attachmentId is required'),
  confirm: z.boolean().describe('Must be true to confirm deletion. This action is irreversible.'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.log': 'text/plain',
};

function guessMimeType(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function formatAttachment(a: JiraAttachment): string {
  const kb = (a.size / 1024).toFixed(1);
  return `- **${a.filename}** (id: ${a.id}, ${kb} KB, ${a.mimeType}) — uploaded by ${a.author.displayName} on ${a.created}\n  Download: ${a.content}`;
}

export function createAttachmentTools(client: JiraClient) {
  return {
    jira_list_attachments: {
      description:
        'List all attachments on a Jira issue. Returns filename, size, MIME type, uploader, and download URL.',
      inputSchema: listAttachmentsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listAttachmentsSchema.parse(args);
        const res = await client.get<JiraIssue>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}?fields=attachment`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const attachments = res.data!.fields.attachment as JiraAttachment[] | undefined;
        if (!attachments || attachments.length === 0) {
          return textResult(`No attachments found on ${parsed.issueKey}.`);
        }

        const lines = attachments.map(formatAttachment);
        return textResult(
          `Attachments on **${parsed.issueKey}** (${attachments.length} total):\n${lines.join('\n')}`,
        );
      },
    },

    jira_add_attachment: {
      description:
        'Upload a local file as an attachment to a Jira issue. Provide the absolute path to the file on disk.',
      inputSchema: addAttachmentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = addAttachmentSchema.parse(args);

        let fileBuffer: Buffer;
        try {
          fileBuffer = await readFile(parsed.filePath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return textResult(`Failed to read file "${parsed.filePath}": ${msg}`, true);
        }

        const fileName = basename(parsed.filePath);
        const mimeType = parsed.mimeType ?? guessMimeType(parsed.filePath);

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
        formData.append('file', blob, fileName);

        const res = await client.postMultipart<JiraAttachment[]>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/attachments`,
          formData,
        );
        if (!res.ok) return textResult(res.error!, true);

        const uploaded = res.data ?? [];
        const names = uploaded.map((a) => `**${a.filename}** (id: ${a.id})`).join(', ');
        return textResult(`Attached ${names} to **${parsed.issueKey}** successfully.`);
      },
    },

    jira_delete_attachment: {
      description:
        'Delete an attachment by ID. Requires confirm: true as a safety guard. Use jira_list_attachments to find attachment IDs.',
      inputSchema: deleteAttachmentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = deleteAttachmentSchema.parse(args);

        if (!parsed.confirm) {
          return textResult(
            'Deletion aborted: you must pass confirm: true to delete an attachment. This is a safety guard.',
            true,
          );
        }

        const res = await client.delete(
          `/rest/api/3/attachment/${encodeURIComponent(parsed.attachmentId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Attachment **${parsed.attachmentId}** deleted successfully.`);
      },
    },
  };
}

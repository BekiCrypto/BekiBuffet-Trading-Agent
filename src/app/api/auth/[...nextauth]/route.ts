import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth routes must always be dynamic — they handle sessions, callbacks, etc.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

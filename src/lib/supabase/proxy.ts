import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export type ProxyAuthState = {
  response: NextResponse;
  userEmail: string | null;
  userId: string | null;
};

export async function getProxyAuthState(
  request: NextRequest
): Promise<ProxyAuthState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase env is missing");
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response,
    userEmail: user?.email?.trim().toLowerCase() ?? null,
    userId: user?.id ?? null,
  };
}

export async function updateSession(request: NextRequest) {
  const authState = await getProxyAuthState(request);
  return authState.response;
}
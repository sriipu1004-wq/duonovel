import Link from "next/link";

export default function AuthorProfilePageContent({ authorId }: { authorId: string }) {
  return <main><Link href={`/authors/${authorId}`}>作者ページ</Link></main>;
}

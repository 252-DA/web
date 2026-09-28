type InstructorNavItem = "dashboard" | "curriculum" | "documents" | "quizzes" | "review" | "learner";

type Props = {
  active: InstructorNavItem;
  courseId: string;
  sid?: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function InstructorNav({ active, courseId, sid }: Props) {
  const items = [
    { key: "dashboard", label: "Dashboard", href: "/manage/dashboard" },
    { key: "curriculum", label: "Đề cương", href: "/manage/curriculum" },
    { key: "documents", label: "Documents", href: "/manage/documents" },
    { key: "quizzes", label: "Soạn đề", href: "/manage/quizzes/new" },
    { key: "review", label: "Quiz & Review", href: "/manage/review" },
    { key: "learner", label: "Learner preview", href: `/learn/courses/${courseId}` },
  ] as const;

  return (
    <nav aria-label="Instructor workspace" className="mt-4 flex flex-wrap gap-2 text-sm">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <a
            key={item.key}
            href={withSid(item.href, sid)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded border border-slate-900 bg-slate-900 px-3 py-2 font-medium text-white"
                : "rounded border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:border-slate-400"
            }
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

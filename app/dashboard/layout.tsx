"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  CalendarDays,
  MessageSquare,
  Files,
  Mail,
  Menu,
  X,
  LogOut,
  Settings,
  User,
  PanelLeftClose,
  PanelLeft,
  Home,
  Search,
  Sparkles,
  Brain,
  AlertTriangle,
  ChevronRight,
  ChevronsUpDown,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AlertBanner, AlertItem } from "@/components/dismissible-alert";
import { Logo } from "@/components/Logo";
import { BreadcrumbProvider, BreadcrumbNav } from "@/components/breadcrumbs";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const baseNavigation = [
  {
    name: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    comingSoon: false,
  },
  {
    name: "Dashboard",
    href: "/dashboard/organizations",
    icon: Building2,
    comingSoon: false,
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getNavigation(pathname: string) {
  const orgMatch = pathname.match(/\/dashboard\/organizations\/([^/]+)/);
  const orgIdRaw = orgMatch ? orgMatch[1] : null;
  const orgId = orgIdRaw && UUID_RE.test(orgIdRaw) ? orgIdRaw : null;

  const orgNavItems = orgId
    ? [
        {
          name: "Calendar",
          href: "/dashboard/calendar",
          icon: CalendarDays,
          comingSoon: false,
        },
        {
          name: "Reports",
          href: "/dashboard/analytics",
          icon: BarChart3,
          comingSoon: false,
        },
        {
          name: "Messages",
          href: `/dashboard/organizations/${orgId}/communication`,
          icon: MessageSquare,
          comingSoon: false,
        },
        {
          name: "Files",
          href: `/dashboard/organizations/${orgId}/files`,
          icon: Files,
          comingSoon: false,
        },
        {
          name: "Mail",
          href: `/dashboard/organizations/${orgId}/mail`,
          icon: Mail,
          comingSoon: false,
        },
      ]
    : [];

  return [...baseNavigation, ...orgNavItems];
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Extract orgId from path for notification bell
  const orgMatch = pathname.match(/\/dashboard\/organizations\/([^/]+)/);
  const currentOrgId = orgMatch && UUID_RE.test(orgMatch[1]) ? orgMatch[1] : null;

  // System alerts
  const [alerts] = useState<AlertItem[]>([]);

  // Theme toggle
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("Logout failed", {
          description: error.message || "An error occurred while logging out.",
        });
        return;
      }
      toast.success("Logged out successfully");
      router.push("/auth/login");
      router.refresh();
    } catch (error) {
      toast.error("Logout failed", {
        description: "An error occurred while logging out.",
      });
    }
  };

  const navItems = getNavigation(pathname);

  return (
    <BreadcrumbProvider>
      <div className="min-h-screen bg-background">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar: Stitch "Intelligent Canvas" style ── */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 ${
            sidebarCollapsed ? "w-[72px]" : "w-64"
          } transform bg-slate-50 dark:bg-slate-950 transition-all duration-300 ease-in-out lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } flex flex-col overflow-hidden`}
        >
          {/* Brand Header */}
          <div
            className={`flex items-center ${
              sidebarCollapsed ? "justify-center px-3" : "gap-3 px-5"
            } h-16 shrink-0`}
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Link href="/" title="Go to Landing Page">
                <Logo className="h-5 w-5" />
              </Link>
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-lg font-semibold tracking-tight text-indigo-700 dark:text-indigo-400 truncate">
                  Workflow360
                </span>
                <span className="text-[0.625rem] font-bold uppercase text-slate-400 tracking-wider">
                  Digital Curator
                </span>
              </div>
            )}
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Search Trigger (Cmd+K) */}
          {!sidebarCollapsed && (
            <div className="px-4 mb-4">
              <div className="flex items-center bg-slate-200/50 dark:bg-slate-800/50 rounded-lg px-3 py-1.5 gap-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Search...</span>
                <span className="ml-auto text-[10px] bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded shadow-sm text-slate-400 font-mono">
                  ⌘K
                </span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto no-scrollbar space-y-6 px-3 py-2">
            {/* General Section */}
            <div>
              {!sidebarCollapsed && (
                <label className="px-3 text-[0.625rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block">
                  General
                </label>
              )}
              <div className="space-y-0.5">
                {navItems.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : item.href === "/dashboard/organizations"
                        ? pathname === "/dashboard/organizations" ||
                          (pathname.startsWith("/dashboard/organizations/") &&
                            !pathname.includes("/communication") &&
                            !pathname.includes("/files") &&
                            !pathname.includes("/mail"))
                        : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  if (item.comingSoon) {
                    return (
                      <div
                        key={item.name}
                        className={`flex items-center ${
                          sidebarCollapsed ? "justify-center" : ""
                        } gap-3 px-3 py-2 text-sm text-slate-400 cursor-not-allowed rounded-lg`}
                        title={sidebarCollapsed ? `${item.name} - Coming Soon` : undefined}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!sidebarCollapsed && (
                          <span className="text-sm">{item.name}</span>
                        )}
                        {!sidebarCollapsed && (
                          <span className="ml-auto text-[9px] bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-bold">
                            Soon
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center ${
                        sidebarCollapsed ? "justify-center" : ""
                      } gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive
                          ? "text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800 font-bold shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                      }`}
                      title={sidebarCollapsed ? item.name : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* Footer — User Profile */}
          <div className="mt-auto shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
            <div
              className={`flex items-center ${
                sidebarCollapsed ? "justify-center" : "gap-3"
              } px-2 py-2`}
            >
              <Avatar
                src={userProfile?.avatar_url || undefined}
                alt={userProfile?.full_name || user?.email || "User"}
                fallback={
                  userProfile?.full_name?.[0]?.toUpperCase() ||
                  user?.email?.[0]?.toUpperCase() ||
                  "U"
                }
                className="h-9 w-9 rounded-xl shrink-0"
              />
              {!sidebarCollapsed && (
                <>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-bold text-foreground truncate">
                      {userProfile?.full_name || user?.email?.split("@")[0] || "User"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium truncate">
                      {user?.email || ""}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                        <Settings className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>My Account</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => router.push("/")}
                      >
                        <Home className="mr-2 h-4 w-4" />
                        Landing Page
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => router.push("/dashboard/settings")}
                      >
                        <User className="mr-2 h-4 w-4" />
                        Profile & Skills
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => router.push("/dashboard/settings")}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={handleLogout}
                        className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main content area ── */}
        <div
          className={`${
            sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64"
          } transition-all duration-300`}
        >
          {/* ── Top navbar: glassmorphism style ── */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm dark:shadow-none px-4 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Sidebar collapse toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex items-center text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            {/* Breadcrumb trail */}
            <div className="flex-1 min-w-0 px-2 hidden sm:flex items-center gap-2 text-sm">
              <BreadcrumbNav />
            </div>

            {/* Right side actions */}
            <div className="ml-auto flex items-center gap-2">
              {/* Search trigger */}
              <div className="hidden md:flex items-center bg-surface-container-low dark:bg-slate-800 px-3 py-1.5 rounded-full text-slate-500 gap-2 cursor-pointer hover:bg-surface-container dark:hover:bg-slate-700 transition-colors">
                <Search className="h-4 w-4" />
                <span className="text-xs">Quick search...</span>
                <span className="text-[10px] border border-slate-300 dark:border-slate-600 rounded px-1 ml-4 font-mono">
                  ⌘K
                </span>
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? (
                  <Sun className="h-4.5 w-4.5" />
                ) : (
                  <Moon className="h-4.5 w-4.5" />
                )}
              </button>

              {/* Notification bell */}
              <NotificationBell orgId={currentOrgId} />

              {/* User avatar (compact, no dropdown — settings in sidebar) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full overflow-hidden border border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 transition-colors">
                    <Avatar
                      src={userProfile?.avatar_url || undefined}
                      alt={userProfile?.full_name || user?.email || "User"}
                      fallback={
                        userProfile?.full_name?.[0]?.toUpperCase() ||
                        user?.email?.[0]?.toUpperCase() ||
                        "U"
                      }
                      className="h-8 w-8"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    {userProfile?.full_name || user?.email?.split("@")[0] || "User"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => router.push("/")}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Landing Page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => router.push("/dashboard/settings")}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile & Skills
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => router.push("/dashboard/settings")}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Alert Banner */}
          {alerts.length > 0 && (
            <div className="px-4 lg:px-8 pt-4">
              <AlertBanner alerts={alerts} />
            </div>
          )}

          {/* Page content */}
          <main className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}

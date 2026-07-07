import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/', label: '搜尋', icon: '🔍' },
  { path: '/pdf-library', label: '文件庫', icon: '📄' },
  { path: '/settings', label: '設定', icon: '⚙️' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="pb-20">
        <Outlet />
      </main>
      <nav className="nav-bottom">
        <div className="max-w-lg mx-auto flex justify-around items-center h-16">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors
                ${isActive(item.path) ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

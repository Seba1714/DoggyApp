import { NavLink } from 'react-router-dom'

export function BottomTabs({ tabs, dark = false }) {
  return (
    <nav className={dark ? 'pd-bottom-tabs' : 'bottom-tabs'}>
      {tabs.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/paseador' || tab.path === '/cliente'}
          className={({ isActive }) =>
            dark
              ? `pd-tab-item ${isActive ? 'active' : ''}`
              : `tab-item ${isActive ? 'active' : ''}`
          }
        >
          <span className={dark ? 'pd-tab-icon' : 'tab-icon'}>{tab.icon}</span>
          <span className={dark ? 'pd-tab-label' : 'tab-label'}>{tab.label}</span>
          {tab.badge > 0 && <span className="tab-badge">{tab.badge}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

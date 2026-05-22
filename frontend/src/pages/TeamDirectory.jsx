import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTeamDirectory, createTeamMember, updateTeamMember, deleteTeamMember, sendTeamMemberCredentials, getTeamMemberProfile } from '../api/client';
import { getRank, scoreColor } from './profileCharts';
import './teamDirectory.css';

export default function TeamDirectory() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('members');
  const [rankings, setRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', slack_id: '' });

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data } = await getTeamDirectory();
      setMembers(data.results || data);
    } catch (err) {
      console.error('Failed to fetch team directory:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRankings = async () => {
    setRankingsLoading(true);
    try {
      const { data } = await getTeamDirectory();
      const membersList = data.results || data;
      const profiles = await Promise.all(
        membersList.map(async (m) => {
          try {
            const { data: profile } = await getTeamMemberProfile(m.id);
            return { ...m, overall_score: profile.overall_score || 0, total_score: profile.total_score || 0, total_meetings: profile.total_meetings || 0 };
          } catch {
            return { ...m, overall_score: 0, total_meetings: 0 };
          }
        })
      );
      profiles.sort((a, b) => b.overall_score - a.overall_score);
      setRankings(profiles);
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
    } finally {
      setRankingsLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'ranking' && rankings.length === 0) {
      fetchRankings();
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenAdd = () => {
    setEditingMember(null);
    setForm({ name: '', email: '', slack_id: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (member) => {
    setEditingMember(member);
    setForm({ name: member.name, email: member.email, slack_id: member.slack_id || '' });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingMember(null);
    setForm({ name: '', email: '', slack_id: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingMember) {
        await updateTeamMember(editingMember.id, form);
        showToast(`${form.name} updated successfully`);
      } else {
        await createTeamMember(form);
        showToast(`${form.name} added to team directory`);
      }
      handleCloseModal();
      fetchMembers();
    } catch (err) {
      const detail = err.response?.data;
      let msg = 'Something went wrong';
      if (detail) {
        if (detail.name) msg = Array.isArray(detail.name) ? detail.name[0] : detail.name;
        else if (detail.email) msg = Array.isArray(detail.email) ? detail.email[0] : detail.email;
        else if (detail.slack_id) msg = Array.isArray(detail.slack_id) ? detail.slack_id[0] : detail.slack_id;
        else if (typeof detail === 'object') msg = Object.values(detail).flat().join(', ');
        else if (typeof detail === 'string') msg = detail;
      }
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (member) => {
    try {
      await deleteTeamMember(member.id);
      showToast(`${member.name} removed from directory`);
      setDeleteConfirm(null);
      fetchMembers();
    } catch (err) {
      showToast('Failed to delete member', 'error');
    }
  };

  const handleSendMail = async (member) => {
    try {
      await sendTeamMemberCredentials(member.id);
      showToast(`Login credentials sent to ${member.name}`);
    } catch (err) {
      showToast('Failed to send credentials email', 'error');
    }
  };

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="td-root animation-fade-in">
      {/* Toast */}
      {toast && (
        <div className={`td-toast td-toast-${toast.type}`}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {toast.type === 'success' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            )}
          </svg>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="td-header">
        <div className="td-header-left">
          <div className="td-header-icon">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h1>Team Directory</h1>
            <p>Manage your team members and view performance rankings</p>
          </div>
        </div>
        {activeTab === 'members' && (
          <button className="td-btn-add" onClick={handleOpenAdd}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className="td-tabs">
        <button
          className={`td-tab ${activeTab === 'members' ? 'td-tab-active' : ''}`}
          onClick={() => handleTabChange('members')}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Team Members
        </button>
        <button
          className={`td-tab ${activeTab === 'ranking' ? 'td-tab-active' : ''}`}
          onClick={() => handleTabChange('ranking')}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Ranking
        </button>
      </div>

      {/* ═══ TAB: Team Members ═══ */}
      {activeTab === 'members' && (
        <>
          {/* Stats */}
          <div className="td-stats">
            <div className="td-stat-card">
              <div className="td-stat-icon blue">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="td-stat-info">
                <span className="td-stat-number">{members.length}</span>
                <span className="td-stat-label">Total Members</span>
              </div>
            </div>
            <div className="td-stat-card">
              <div className="td-stat-icon green">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="td-stat-info">
                <span className="td-stat-number">{members.filter(m => m.email).length}</span>
                <span className="td-stat-label">Email Linked</span>
              </div>
            </div>
            <div className="td-stat-card">
              <div className="td-stat-icon purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.124a2.528 2.528 0 0 1 2.523 2.52A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.52h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              </div>
              <div className="td-stat-info">
                <span className="td-stat-number">{members.filter(m => m.slack_id).length}</span>
                <span className="td-stat-label">Slack Linked</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="td-search-bar">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="td-search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          {/* Member List */}
          <div className="td-list">
            {loading ? (
              <div className="td-empty">
                <div className="td-spinner" />
                <p>Loading team directory...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="td-empty">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3>{searchQuery ? 'No results found' : 'No team members yet'}</h3>
                <p>{searchQuery ? 'Try a different search term' : 'Add your first team member to start sending notifications'}</p>
                {!searchQuery && (
                  <button className="td-btn-add" onClick={handleOpenAdd} style={{ marginTop: 16 }}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add First Member
                  </button>
                )}
              </div>
            ) : (
              filtered.map((member) => (
                <div key={member.id} className="td-member-card">
                  <div className="td-member-avatar">
                    {member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="td-member-info">
                    <h4 className="td-member-name">{member.name}</h4>
                    <div className="td-member-channels">
                      {member.email && (
                        <span className="td-channel td-channel-email">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {member.email}
                        </span>
                      )}
                      {member.slack_id && (
                        <span className="td-channel td-channel-slack">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
                          </svg>
                          {member.slack_id}
                        </span>
                      )}
                      {member.key && (
                        <span className="td-channel" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          🔑 {member.key}
                          <button
                            className="td-copy-btn"
                            title="Copy key"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(member.key);
                              showToast(`Key copied to clipboard`);
                            }}
                          >
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {!member.email && !member.slack_id && !member.key && (
                        <span className="td-channel td-channel-none">No contact info</span>
                      )}
                    </div>
                  </div>
                  <div className="td-member-actions">
                    <button className="td-action-btn" onClick={() => navigate(`/team/${member.id}`)} title="View Profile" style={{ color: '#00C896', background: 'rgba(0, 200, 150, 0.1)' }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </button>
                    {member.email && (
                      <button className="td-action-btn" onClick={() => handleSendMail(member)} title="Send Login Credentials" style={{ color: '#6366f1', background: 'rgba(99, 102, 241, 0.1)' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                    <button className="td-action-btn td-action-edit" onClick={() => handleOpenEdit(member)} title="Edit">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button className="td-action-btn td-action-delete" onClick={() => setDeleteConfirm(member)} title="Delete">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ═══ TAB: Ranking ═══ */}
      {activeTab === 'ranking' && (
        <div className="td-ranking-section">
          {rankingsLoading ? (
            <div className="td-empty">
              <div className="td-spinner" />
              <p>Loading rankings...</p>
            </div>
          ) : rankings.length === 0 ? (
            <div className="td-empty">
              <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3>No rankings yet</h3>
              <p>Add team members and complete some meetings to see rankings</p>
            </div>
          ) : (
            <div className="td-ranking-list">
              {rankings.map((member, index) => {
                const rnk = getRank(member.total_score || 0);
                const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                const isTop3 = index < 3;
                return (
                  <div
                    key={member.id}
                    className={`td-ranking-row ${isTop3 ? 'td-ranking-top' : ''}`}
                    onClick={() => navigate(`/team/${member.id}`)}
                  >
                    <div
                      className="td-ranking-position"
                      style={{
                        background: isTop3 ? `${medalColors[index]}18` : 'rgba(255,255,255,0.04)',
                        color: isTop3 ? medalColors[index] : '#64748b',
                        borderColor: isTop3 ? `${medalColors[index]}44` : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {isTop3 ? (index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉') : `#${index + 1}`}
                    </div>
                    <div className="td-ranking-avatar" style={{ background: `linear-gradient(135deg, ${rnk.color}44, ${rnk.color}22)`, borderColor: `${rnk.color}44` }}>
                      {member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="td-ranking-info">
                      <div className="td-ranking-name">{member.name}</div>
                      <div className="td-ranking-meta">
                        <span style={{ color: rnk.color }}>Lv{rnk.level} {rnk.label}</span>
                        <span>·</span>
                        <span>{member.total_meetings} meetings</span>
                      </div>
                    </div>
                    <div className="td-ranking-score">
                      <span className="td-ranking-score-value" style={{ color: scoreColor(member.overall_score) }}>
                        {member.overall_score}
                      </span>
                      <span className="td-ranking-score-label">Score</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="td-modal-overlay" onClick={handleCloseModal}>
          <div className="td-modal" onClick={(e) => e.stopPropagation()}>
            <div className="td-modal-header">
              <h2>{editingMember ? 'Edit Member' : 'Add New Member'}</h2>
              <button className="td-modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="td-modal-form">
              <div className="td-form-group">
                <label>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Display Name <span className="td-required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Exactly as it appears in Google Meet"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
                <span className="td-form-hint">Must match the person's Google Meet display name exactly</span>
              </div>
              <div className="td-form-group">
                <label>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email Address <span className="td-required">*</span>
                </label>
                <input
                  type="email"
                  placeholder="john@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="td-form-group">
                <label>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
                  </svg>
                  Slack User ID
                </label>
                <input
                  type="text"
                  placeholder="U0123ABCD"
                  value={form.slack_id}
                  onChange={(e) => setForm({ ...form, slack_id: e.target.value })}
                />
                <span className="td-form-hint">Find this in Slack → Profile → More → Copy Member ID</span>
              </div>
              <div className="td-form-group">
                <label>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3l8.44-8.44A6 6 0 0115 7h0z" />
                  </svg>
                  Login Key
                </label>
                <input
                  type="text"
                  value={editingMember ? editingMember.key : 'Generated automatically'}
                  readOnly
                  disabled
                  style={{ opacity: 0.7 }}
                />
                <span className="td-form-hint">Used by the team member to view their dashboard</span>
              </div>
              <div className="td-modal-actions">
                <button type="button" className="td-btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="td-btn-submit">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {editingMember ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="td-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="td-modal td-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="td-delete-content">
              <div className="td-delete-icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3>Remove {deleteConfirm.name}?</h3>
              <p>This person will no longer receive action item notifications. This action cannot be undone.</p>
              <div className="td-modal-actions">
                <button className="td-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="td-btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

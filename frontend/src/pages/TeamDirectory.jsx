import { useState, useEffect } from 'react';
import { getTeamDirectory, createTeamMember, updateTeamMember, deleteTeamMember } from '../api/client';
import './teamDirectory.css';

export default function TeamDirectory() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);

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
      const msg = typeof detail === 'object' ? Object.values(detail).flat().join(', ') : 'Something went wrong';
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
            <p>Manage your team members for action item notifications</p>
          </div>
        </div>
        <button className="td-btn-add" onClick={handleOpenAdd}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Member
        </button>
      </header>

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
                  {!member.email && !member.slack_id && (
                    <span className="td-channel td-channel-none">No contact info</span>
                  )}
                </div>
              </div>
              <div className="td-member-actions">
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
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="john@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
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

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Phone, MapPin, Edit2, Trash2,
  X, ChevronDown, ChevronUp, Building2,
  FileText, Star, Calendar, CheckCircle,
  AlertTriangle, User, Navigation,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Avatar     from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import {
  loadCustomers, saveCustomer, deleteCustomer, generateCustomerId,
  CUSTOMER_TYPES, getCustomerTypeCfg, getCustomerStats,
} from '../data/customerData'
import { loadBookings, TRIP_TYPE_CONFIG, getStatusCfg } from '../data/tripTypes'
import ModalOverlay from '../components/ui/ModalOverlay'
import { addAuditEvent } from '../data/auditLogData'

// ─────────────────────────────────────────────────────────────
//  Type badge
// ─────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const cfg = getCustomerTypeCfg(type)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
//  Input Restrictions & Validation Rules
// ─────────────────────────────────────────────────────────────
const FIELD_RESTRICTIONS = {
  name: {
    maxLength: 50,
    minLength: 2,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    errorMsg: 'Only letters, spaces, hyphens, and apostrophes allowed',
    placeholder: 'Full name or company name (2-50 chars)',
  },
  mobile: {
    maxLength: 10,
    minLength: 10,
    pattern: /^[0-9]*$/,
    errorMsg: 'Mobile must be exactly 10 digits',
    placeholder: '10-digit mobile number (e.g., 9876543210)',
  },
  altMobile: {
    maxLength: 10,
    minLength: 0,
    pattern: /^[0-9]*$/,
    errorMsg: 'Mobile must be 10 digits',
    placeholder: '10 digits only (optional)',
  },
  email: {
    maxLength: 100,
    pattern: /^[^\s]*@?[^\s]*\.?[^\s]*$/,
    errorMsg: 'Please enter a valid email address',
    placeholder: 'user@example.com (optional)',
  },
  city: {
    maxLength: 30,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    errorMsg: 'Only letters, spaces, hyphens, and apostrophes allowed',
    placeholder: 'City name (optional)',
  },
  state: {
    maxLength: 30,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    errorMsg: 'Only letters, spaces, hyphens, and apostrophes allowed',
    placeholder: 'State name (optional)',
  },
  address: {
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-',./]*$/,
    errorMsg: 'Address contains invalid characters',
    placeholder: 'Door no., Street name (optional)',
  },
  companyName: {
    maxLength: 60,
    pattern: /^[a-zA-Z0-9\s\-'.&()]*$/,
    errorMsg: 'Only alphanumeric, spaces, and basic punctuation allowed',
    placeholder: 'Registered company name (optional)',
  },
  contactPerson: {
    maxLength: 50,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    errorMsg: 'Only letters, spaces, hyphens, and apostrophes allowed',
    placeholder: 'Primary contact name (optional)',
  },
  gst: {
    maxLength: 15,
    pattern: /^[0-9A-Z]*$/,
    errorMsg: 'GST must be 15 alphanumeric characters (e.g., 29AAACM0000A1Z5)',
    placeholder: 'GSTIN - 15 characters (optional)',
  },
  billingAddress: {
    maxLength: 120,
    pattern: /^[a-zA-Z0-9\s\-',./]*$/,
    errorMsg: 'Address contains invalid characters',
    placeholder: 'GST billing address (optional)',
  },
  notes: {
    maxLength: 300,
    errorMsg: 'Notes cannot exceed 300 characters',
    placeholder: 'Preferred driver, vehicle, payment terms, VIP status…',
  },
}

// ─────────────────────────────────────────────────────────────
//  Add / Edit Customer Modal — Module 2 & 3
// ─────────────────────────────────────────────────────────────
const EMPTY_CUSTOMER = {
  id:'', type:'individual', status:'active',
  name:'', mobile:'', altMobile:'', email:'',
  address:'', city:'', state:'Tamil Nadu',
  gst:'', companyName:'', contactPerson:'', billingAddress:'',
  notes:'',
  isVip:false, isBlacklisted:false, isFrequentTraveller:false,
  emergencyName:'', emergencyContact:'',
}

// ─ Separate field input component to prevent re-renders ─
function FormField({ label, field, type = 'text', required, placeholder, value, onChange, error }) {
  const restrictions = FIELD_RESTRICTIONS[field]
  const maxLength = restrictions?.maxLength
  const currentLength = (value || '').length

  const handleChange = (e) => {
    let inputValue = e.target.value

    // Apply restrictions
    if (restrictions) {
      // Enforce max length
      if (maxLength && inputValue.length > maxLength) {
        inputValue = inputValue.slice(0, maxLength)
      }

      // Special handling for mobile fields - only numbers
      if (field === 'mobile' || field === 'altMobile') {
        inputValue = inputValue.replace(/\D/g, '')
      }

      // Special handling for GST - uppercase
      if (field === 'gst') {
        inputValue = inputValue.toUpperCase()
      }

      // Apply pattern restriction (only for non-email fields)
      // Email is validated on save only, not during typing
      if (restrictions.pattern && inputValue.length > 0 && field !== 'email') {
        // For pattern validation, check character by character
        const lastChar = inputValue[inputValue.length - 1]
        if (!restrictions.pattern.test(inputValue)) {
          // Remove the last invalid character
          inputValue = inputValue.slice(0, -1)
        }
      }
    }

    onChange({ target: { value: inputValue } })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {maxLength && (
          <span className={`text-[9px] font-semibold ${
            currentLength > maxLength * 0.9
              ? 'text-red-500'
              : currentLength > maxLength * 0.7
              ? 'text-amber-500'
              : 'text-slate-400 dark:text-slate-500'
          }`}>
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
      <input
        type={type}
        value={value || ''}
        placeholder={restrictions?.placeholder || placeholder}
        onChange={handleChange}
        maxLength={maxLength || undefined}
        required={required}
        className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
          focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all
          ${error ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-navy-700'}`}
      />
      {error && (
        <div className="mt-1 flex items-start gap-1.5">
          <span className="text-red-500 text-[10px] font-bold mt-0.5">⚠</span>
          <p className="text-[11px] text-red-500">{error}</p>
        </div>
      )}
    </div>
  )
}

// ─ Separate select component ─
function FormSelect({ label, field, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <select
        value={value || ''}
        onChange={onChange}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none"
      >
        {options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─ Section separator ─
function FormSection({ title }) {
  return <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-t border-slate-100 dark:border-navy-700 pt-3 mt-1">{title}</p>
}

function CustomerModal({ customer, onClose, onSave }) {
  const isEdit = !!customer?.id
  const [form,   setForm]   = useState(() => customer || { ...EMPTY_CUSTOMER })
  const [errors, setErrors] = useState({})

  // ─ Use useCallback to memoize the updater function ─
  const upd = useCallback(p => setForm(f => ({ ...f, ...p })), [])

  const validate = () => {
    const e = {}

    // Required field validations
    if (!form.name.trim()) {
      e.name = 'Customer name is required'
    } else {
      const nameRes = FIELD_RESTRICTIONS.name
      if (form.name.length < nameRes.minLength) {
        e.name = `Name must be at least ${nameRes.minLength} characters`
      } else if (!nameRes.pattern.test(form.name)) {
        e.name = nameRes.errorMsg
      }
    }

    if (!form.mobile.trim()) {
      e.mobile = 'Mobile number is required'
    } else {
      const mobileRes = FIELD_RESTRICTIONS.mobile
      if (form.mobile.length !== mobileRes.maxLength) {
        e.mobile = `Mobile must be exactly ${mobileRes.maxLength} digits`
      } else if (!mobileRes.pattern.test(form.mobile)) {
        e.mobile = 'Mobile must contain only numbers'
      }
    }

    // Optional field validations (only if not empty)
    if (form.altMobile.trim()) {
      const altRes = FIELD_RESTRICTIONS.altMobile
      if (form.altMobile.length !== altRes.maxLength) {
        e.altMobile = `Alternate mobile must be ${altRes.maxLength} digits`
      } else if (!altRes.pattern.test(form.altMobile)) {
        e.altMobile = 'Must contain only numbers'
      }
    }

    if (form.email.trim()) {
      const emailRes = FIELD_RESTRICTIONS.email
      // Proper email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(form.email)) {
        e.email = emailRes.errorMsg
      }
    }

    if (form.gst.trim()) {
      const gstRes = FIELD_RESTRICTIONS.gst
      if (form.gst.length !== 15) {
        e.gst = 'GST must be exactly 15 characters'
      } else if (!gstRes.pattern.test(form.gst)) {
        e.gst = gstRes.errorMsg
      }
    }

    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const now = new Date().toISOString()
    onSave({
      ...form,
      id:        form.id || generateCustomerId(),
      createdAt: form.createdAt || now,
      updatedAt: now,
    })
  }

  const isCorporate = form.type === 'corporate' || form.type === 'agent'

  // ─ Memoized change handlers for each field ─
  const handleNameChange = useCallback(e => upd({ name: e.target.value }), [upd])
  const handleMobileChange = useCallback(e => upd({ mobile: e.target.value }), [upd])
  const handleAltMobileChange = useCallback(e => upd({ altMobile: e.target.value }), [upd])
  const handleEmailChange = useCallback(e => upd({ email: e.target.value }), [upd])
  const handleTypeChange = useCallback(e => upd({ type: e.target.value }), [upd])
  const handleAddressChange = useCallback(e => upd({ address: e.target.value }), [upd])
  const handleCityChange = useCallback(e => upd({ city: e.target.value }), [upd])
  const handleStateChange = useCallback(e => upd({ state: e.target.value }), [upd])
  const handleCompanyNameChange = useCallback(e => upd({ companyName: e.target.value }), [upd])
  const handleContactPersonChange = useCallback(e => upd({ contactPerson: e.target.value }), [upd])
  const handleGstChange = useCallback(e => upd({ gst: e.target.value }), [upd])
  const handleBillingAddressChange = useCallback(e => upd({ billingAddress: e.target.value }), [upd])
  const handleNotesChange = useCallback(e => upd({ notes: e.target.value }), [upd])

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[500px] max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isEdit ? 'Edit Customer' : 'Add Customer'}</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">
              {isEdit ? form.name : 'New Customer'}
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FormField
                label="Customer Name"
                field="name"
                required
                value={form.name}
                onChange={handleNameChange}
                error={errors.name}
              />
            </div>
            <FormField
              label="Mobile Number"
              field="mobile"
              required
              type="tel"
              value={form.mobile}
              onChange={handleMobileChange}
              error={errors.mobile}
            />
            <FormField
              label="Alternate Number"
              field="altMobile"
              type="tel"
              value={form.altMobile}
              onChange={handleAltMobileChange}
              error={errors.altMobile}
            />
            <FormField
              label="Email"
              field="email"
              type="email"
              value={form.email}
              onChange={handleEmailChange}
              error={errors.email}
            />
            <FormSelect
              label="Customer Type"
              field="type"
              value={form.type}
              onChange={handleTypeChange}
              options={CUSTOMER_TYPES}
            />
          </div>

          {/* Address */}
          <FormSection title="Address" />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FormField
                label="Street Address"
                field="address"
                value={form.address}
                onChange={handleAddressChange}
                error={errors.address}
              />
            </div>
            <FormField
              label="City"
              field="city"
              value={form.city}
              onChange={handleCityChange}
              error={errors.city}
            />
            <FormField
              label="State"
              field="state"
              value={form.state}
              onChange={handleStateChange}
              error={errors.state}
            />
          </div>

          {/* Corporate fields */}
          {isCorporate && (
            <>
              <FormSection title="Corporate Details" />
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FormField
                    label="Company Name"
                    field="companyName"
                    value={form.companyName}
                    onChange={handleCompanyNameChange}
                    error={errors.companyName}
                  />
                </div>
                <FormField
                  label="Contact Person"
                  field="contactPerson"
                  value={form.contactPerson}
                  onChange={handleContactPersonChange}
                  error={errors.contactPerson}
                />
                <FormField
                  label="GST Number"
                  field="gst"
                  value={form.gst}
                  onChange={handleGstChange}
                  error={errors.gst}
                />
                <div className="col-span-2">
                  <FormField
                    label="Billing Address"
                    field="billingAddress"
                    value={form.billingAddress}
                    onChange={handleBillingAddressChange}
                    error={errors.billingAddress}
                  />
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <FormSection title="Notes" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Customer Notes
              </label>
              <span className={`text-[9px] font-semibold ${
                form.notes.length > 270 ? 'text-red-500' : form.notes.length > 210 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
              }`}>{form.notes.length}/300</span>
            </div>
            <textarea
              value={form.notes || ''}
              onChange={e => { let val = e.target.value; if (val.length > 300) val = val.slice(0,300); handleNotesChange({ target:{ value:val } }) }}
              placeholder="Preferred driver, vehicle, payment terms…"
              rows={3} maxLength={300}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25 resize-none transition-all"
            />
          </div>

          {/* Emergency Contact */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 mt-1">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Contact Name</label>
                <input value={form.emergencyName||''} onChange={e=>upd({emergencyName:e.target.value})} placeholder="Family member / Friend"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Mobile</label>
                <input value={form.emergencyContact||''} onChange={e=>upd({emergencyContact:e.target.value.replace(/\D/g,'').slice(0,10)})} placeholder="10-digit mobile"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
              </div>
            </div>
          </div>

          {/* Customer Flags */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 mt-1">Customer Flags</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { key:'isVip',               label:'⭐ VIP Customer',       on:'border-amber-400 bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300'  },
                { key:'isFrequentTraveller', label:'🔁 Frequent Traveller', on:'border-blue-400 bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300'     },
                { key:'isBlacklisted',       label:'🚫 Blacklisted',        on:'border-red-400 bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300'          },
              ].map(f => (
                <button key={f.key} type="button" onClick={() => upd({ [f.key]: !form[f.key] })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                    form[f.key] ? `${f.on} ring-2 ring-offset-1 ring-current/30` : 'border-slate-200 dark:border-navy-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-800'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/50 rounded-b-3xl sm:rounded-b-3xl flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-navy-600 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-700 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all">
            {isEdit ? 'Update' : 'Create'} Customer
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Customer Profile (expanded details)
// ─────────────────────────────────────────────────────────────
function CustomerProfile({ customer, bookings, onEdit, onDelete, onBooking, canEdit, canDelete }) {
  const isCorp = customer.type === 'corporate' || customer.type === 'agent'
  const stats = getCustomerStats(customer.id, customer.name, bookings)

  const renderField = (label, value, icon = null) => (
    value ? (
      <div className="flex items-start gap-2.5">
        {icon && <span className="text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{label}</p>
          <p className="text-slate-800 dark:text-slate-100 text-sm break-words">{value}</p>
        </div>
      </div>
    ) : null
  )

  return (
    <div className="bg-slate-50/50 dark:bg-navy-800/30 border-t border-slate-100 dark:border-navy-700 px-4 py-4 space-y-4">

      {/* VIP / Blacklist badges */}
      {(customer.isVip || customer.isBlacklisted || customer.isFrequentTraveller) && (
        <div className="flex gap-2 flex-wrap">
          {customer.isVip               && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">⭐ VIP</span>}
          {customer.isFrequentTraveller && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">🔁 Frequent</span>}
          {customer.isBlacklisted       && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">🚫 Blacklisted</span>}
        </div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        {renderField('Name', customer.name)}
        {renderField('Type', getCustomerTypeCfg(customer.type).label)}
        {renderField('Mobile', customer.mobile, <Phone size={14} />)}
        {renderField('Alternate', customer.altMobile)}
        {renderField('Email', customer.email)}
        {renderField('Status', customer.status)}
      </div>

      {/* Address */}
      {(customer.address || customer.city || customer.state) && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div className="grid grid-cols-2 gap-4">
            {renderField('Address', customer.address, <MapPin size={14} />)}
            {renderField('City', customer.city)}
            {renderField('State', customer.state)}
          </div>
        </>
      )}

      {/* Corporate */}
      {isCorp && (customer.companyName || customer.gst) && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div className="grid grid-cols-2 gap-4">
            {renderField('Company', customer.companyName, <Building2 size={14} />)}
            {renderField('Contact', customer.contactPerson)}
            {renderField('GST', customer.gst)}
            {renderField('Billing Address', customer.billingAddress)}
          </div>
        </>
      )}

      {/* Notes */}
      {customer.notes && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div className="flex gap-2.5">
            <FileText size={14} className="text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Notes</p>
              <p className="text-slate-700 dark:text-slate-300 text-sm">{customer.notes}</p>
            </div>
          </div>
        </>
      )}

      {/* Emergency Contact */}
      {(customer.emergencyName || customer.emergencyContact) && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div className="grid grid-cols-2 gap-3">
            {customer.emergencyName    && renderField('Emergency Name',   customer.emergencyName)}
            {customer.emergencyContact && renderField('Emergency Mobile', customer.emergencyContact)}
          </div>
        </>
      )}

      {/* Stats */}
      {stats.totalTrips > 0 && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white dark:bg-navy-700/40 p-2">
              <p className="font-bold text-navy-900 dark:text-white">{stats.totalTrips}</p>
              <p className="text-slate-500 dark:text-slate-400 text-[9px]">Total Trips</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-navy-700/40 p-2">
              <p className="font-bold text-emerald-600 dark:text-emerald-400">{stats.completedTrips}</p>
              <p className="text-slate-500 dark:text-slate-400 text-[9px]">Completed</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-navy-700/40 p-2">
              <p className="font-bold text-blue-600 dark:text-blue-400">{stats.activeTrips}</p>
              <p className="text-slate-500 dark:text-slate-400 text-[9px]">Active</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-navy-700/40 p-2">
              <p className="font-bold text-slate-800 dark:text-white">₹{stats.totalRevenue?.toLocaleString('en-IN')}</p>
              <p className="text-slate-500 dark:text-slate-400 text-[9px]">Revenue</p>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="border-t border-slate-200 dark:border-navy-600 pt-3 flex gap-2">
        {canEdit && (
          <button onClick={() => onEdit(customer)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all flex-1">
            <Edit2 size={12} /> Edit
          </button>
        )}
        <button onClick={() => onBooking(customer)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all flex-1">
          <Calendar size={12} /> Book Trip
        </button>
        {canDelete && (
          <button onClick={() => onDelete(customer.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-all">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Upcoming trips */}
      {stats.upcoming?.length > 0 && (
        <>
          <div className="border-t border-slate-200 dark:border-navy-600 pt-3" />
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Upcoming Trips</p>
            <div className="space-y-1.5">
              {stats.upcoming.slice(0, 3).map(b => (
                <div key={b.id} className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-navy-700/40">
                  <span className="flex-1">{b.tripType}</span>
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.startDate?.split('T')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Quick Booking Modal
// ─────────────────────────────────────────────────────────────
function QuickBookingModal({ customer, onClose }) {
  const navigate = useNavigate()
  const handleQuickBook = () => {
    navigate(`/trips?customer=${encodeURIComponent(customer.name)}`)
    onClose()
  }
  return (
    <ModalOverlay center onClose={onClose}>
      <div className="relative bg-white dark:bg-navy-900 rounded-3xl shadow-2xl p-6 max-w-sm mx-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Start a new trip for <span className="font-bold">{customer.name}</span>?
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-navy-600 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-800 transition-all">
            Cancel
          </button>
          <button onClick={handleQuickBook} className="flex-1 px-4 py-2 rounded-lg bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all">
            Start Booking
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Customers List
// ─────────────────────────────────────────────────────────────export default function Customers() {
export default function Customers() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Async state ────────────────────────────────────────────
  const [customers,    setCustomers]    = useState([])
  const [bookings,     setBookings]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showAdd,      setShowAdd]      = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [bookingFor,   setBookingFor]   = useState(null)
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [flagFilter,   setFlagFilter]   = useState('all')
  const [sortBy,       setSortBy]       = useState('name')
  const [expanded,     setExpanded]     = useState(null)
  const [toast,        setToast]        = useState('')
  const [loadError,    setLoadError]    = useState(null)

  const canAdd    = ['admin', 'manager'].includes(user?.role)
  const canEdit   = ['admin', 'manager'].includes(user?.role)
  const canDelete = user?.role === 'admin'

  // ── Load from Supabase on mount ────────────────────────────
  const reload = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([loadCustomers(), loadBookings()])
      setCustomers(Array.isArray(c) ? c.filter(x => !x._deleted) : [])
      setBookings(Array.isArray(b) ? b : [])
      setLoadError(null)
    } catch (err) {
      console.error('[Customers] load failed:', err)
      setLoadError('Could not load customers. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSave = async (customer) => {
    const isNew = !customers.find(c => c.id === customer.id)
    try {
      await saveCustomer(customer)
      if (isNew) {
        addAuditEvent('CUSTOMER_ADDED', { description: `${customer.name} — ${customer.type || 'individual'}` })
      }
      await reload()
      setShowAdd(false)
      setEditCustomer(null)
      showToast(`${isNew ? 'Added' : 'Updated'} ${customer.name}`)
    } catch (err) {
      console.error('[Customers] save failed:', err)
      showToast('Could not save customer. Please try again.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this customer? This cannot be undone.')) return
    try {
      await deleteCustomer(id)
      await reload()
      showToast('Customer deleted')
    } catch (err) {
      console.error('[Customers] delete failed:', err)
      showToast('Could not delete customer. Please try again.')
    }
  }

  const filtered = useMemo(() => {
    return customers
      .filter(c => typeFilter === 'all' || c.type === typeFilter)
      .filter(c => {
        if (flagFilter === 'vip')         return c.isVip
        if (flagFilter === 'frequent')    return c.isFrequentTraveller
        if (flagFilter === 'blacklisted') return c.isBlacklisted
        return true
      })
      .filter(c =>
        !search ||
        (c.name ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
        (c.mobile ?? '').includes(search) ||
        (c.city ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes((search ?? '').toLowerCase())
      )
      .sort((a, b) =>
        sortBy === 'name'   ? (a.name ?? '').localeCompare(b.name ?? '') :
        sortBy === 'city'   ? (a.city || '').localeCompare(b.city || '') :
        sortBy === 'recent' ? (b.updatedAt || '').localeCompare(a.updatedAt || '') :
        0
      )
  }, [customers, search, typeFilter, flagFilter, sortBy])

  const corporateCount = customers.filter(c => c.type === 'corporate' || c.type === 'agent').length
  const newThisMonth = customers.filter(c => {
    const created = new Date(c.createdAt || 0)
    const now = new Date()
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
  }).length

  if (user?.role === 'driver') {
    return (
      <div className="space-y-5 animate-fade-up">
        <PageHeader title="Customers" subtitle="Driver access view" />
        <div className="glass-card rounded-2xl p-12 text-center">
          <User size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-bold text-slate-500 dark:text-slate-400">Customer management is not available for drivers.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers in directory`}
        action={canAdd
          ? <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
              <Plus size={15} /> Add Customer
            </button>
          : null}
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
          </div>
          <button onClick={reload}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{toast}</p>
        </div>
      )}

      {/* Module 8: Dashboard widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Customers',   value: customers.length,  color:'text-navy-800 dark:text-blue-300',          filter:'all'        },
          { label:'Individual',        value: customers.filter(c=>c.type==='individual').length, color:'text-blue-600 dark:text-blue-400', filter:'individual' },
          { label:'Corporate / Agent', value: corporateCount,    color:'text-violet-600 dark:text-violet-400',       filter:'corporate'  },
          { label:'New This Month',    value: newThisMonth,      color:'text-emerald-600 dark:text-emerald-400',     filter:'all'        },
        ].map(s => (
          <div key={s.label} onClick={() => setTypeFilter(s.filter)}
            className="glass-card rounded-xl p-4 text-center hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5">
            <p className={`text-2xl font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-wrap gap-2.5 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, mobile, city…"
            className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none w-full font-body" />
        </div>

        {/* Type filter */}
        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
          {[['all','All'], ...CUSTOMER_TYPES.map(t => [t.key, t.label])].map(([k,l]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                typeFilter === k
                  ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                  : 'text-slate-500 dark:text-slate-400'
              }`}>{l}
            </button>
          ))}
        </div>

        {/* Flag filter chips */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key:'all',         label:'All'         },
            { key:'vip',         label:'⭐ VIP'      },
            { key:'frequent',    label:'🔁 Frequent' },
            { key:'blacklisted', label:'🚫 Listed'   },
          ].map(f => (
            <button key={f.key} onClick={() => setFlagFilter(f.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                flagFilter === f.key
                  ? 'bg-navy-900 dark:bg-blue-700 text-white shadow'
                  : 'bg-slate-100 dark:bg-navy-800 text-slate-500 dark:text-slate-400'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none font-body">
          <option value="name">Sort: Name</option>
          <option value="city">Sort: City</option>
          <option value="recent">Sort: Recent</option>
        </select>
      </div>

      {/* Customer list */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <User size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No customers found</p>
          {canAdd && (
            <button onClick={() => setShowAdd(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 transition-all">
              <Plus size={13} /> Add First Customer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(c => {
            const isOpen  = expanded === c.id
            const isCorp  = c.type === 'corporate' || c.type === 'agent'
            const stats   = getCustomerStats(c.id, c.name, bookings)

            return (
              <div key={c.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200">
                {/* Row */}
                <div className="flex items-center gap-3 p-4 cursor-pointer select-none"
                     onClick={() => setExpanded(isOpen ? null : c.id)}>
                  <div className="relative flex-shrink-0">
                    <Avatar name={c.name} size={40} />
                    {c.notes && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white dark:border-navy-800" title="Has notes" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-bold text-slate-800 dark:text-white text-sm">{c.name}</p>
                      {isCorp && c.companyName && (
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[100px]">{c.companyName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <Phone size={9} className="flex-shrink-0" />
                      <span>{c.mobile}</span>
                      {c.city && <><span className="text-slate-300 dark:text-navy-600 mx-1">·</span><MapPin size={9} className="flex-shrink-0" /><span>{c.city}</span></>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <TypeBadge type={c.type} />
                    {stats.totalTrips > 0 && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{stats.totalTrips} trip{stats.totalTrips !== 1 ? 's' : ''}</p>
                    )}
                  </div>

                  {isOpen ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0 ml-1" />
                           : <ChevronDown size={14} className="text-slate-400 flex-shrink-0 ml-1" />}
                </div>

                {/* Expanded profile */}
                {isOpen && (
                  <CustomerProfile
                    customer={c}
                    bookings={bookings}
                    onEdit={setEditCustomer}
                    onDelete={handleDelete}
                    onBooking={setBookingFor}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {(showAdd || editCustomer) && (
        <CustomerModal
          customer={editCustomer}
          onClose={() => { setShowAdd(false); setEditCustomer(null) }}
          onSave={handleSave}
        />
      )}
      {bookingFor && (
        <QuickBookingModal customer={bookingFor} onClose={() => setBookingFor(null)} />
      )}
    </div>
  )
}
import { useState } from 'react'; import { Link, useLocation, useNavigate } from 'react-router-dom'; import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'; import { FiEye, FiEyeOff } from 'react-icons/fi'; import api from '../api/client'; import { useAuth } from '../context/AuthContext';
import PhoneInput from '../components/PhoneInput';
export default function Auth({ mode }) {
  const register = mode === 'register'; const [values,setValues]=useState({name:'',email:'',phone:'',password:'',confirmPassword:''}); const [visible,setVisible]=useState({password:false,confirmPassword:false}); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const {refresh}=useAuth(); const navigate=useNavigate(); const location=useLocation();
  const returnTo = new URLSearchParams(location.search).get('returnTo') || '/dashboard';
  const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const change=(e)=>setValues({...values,[e.target.name]:e.target.value});
  const changePhone = (phone) => setValues((current) => ({ ...current, phone }));
  const googleLogin=async(credential)=>{if(busy)return;setError('');setBusy(true);try{await api.post('/auth/google',{credential});await refresh();navigate(returnTo,{replace:true});}catch(err){setError(err.message);}finally{setBusy(false);}};
  const googleButton = googleEnabled && <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}><GoogleLogin text="continue_with" width="100%" onSuccess={({credential})=>credential&&googleLogin(credential)} onError={()=>setError('Google sign-in could not be completed.')} useOneTap={false} /></GoogleOAuthProvider>;
  const submit=async(e)=>{e.preventDefault();if(busy)return;setError('');if(register&&!values.phone)return setError('Please enter your phone number.');if(register&&values.password.length<5)return setError('Use at least 5 characters for your password.');if(register&&!/[a-z]/.test(values.password))return setError('Add at least one lowercase letter to your password.');if(register&&!/[A-Z]/.test(values.password))return setError('Add at least one uppercase letter to your password.');if(register&&!/[0-9]/.test(values.password))return setError('Add at least one number to your password.');if(register&&values.password!==values.confirmPassword)return setError('Your passwords do not match.');setBusy(true);try{await api.post(`/auth/${register?'register':'login'}`,values);await refresh();navigate(returnTo,{replace:true});}catch(err){setError(err.message);}finally{setBusy(false);}};
  const passwordInput=(name,label,autoComplete,extra=null)=><label className="auth-field">{label}<span className="password-input"><input type={visible[name]?'text':'password'} name={name} value={values[name]} onChange={change} required {...(name==='password'?{minLength:'5'}:{})} autoComplete={autoComplete}/><button className="password-toggle" type="button" aria-label={`${visible[name]?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible[name]} onClick={()=>setVisible({...visible,[name]:!visible[name]})}>{visible[name]?<FiEyeOff aria-hidden="true"/>:<FiEye aria-hidden="true"/>}</button></span>{extra}</label>;
  return (
    <main className={`auth-page${register ? ' is-register' : ' is-login'}`}>
      <aside className="auth-art">
        <span className="auth-art-mark" aria-hidden="true">♻</span>
        <span className="kicker">A circle of good things</span>
        <h2>{register ? <>Good things<br /><em>start with us.</em></> : <>Welcome back<br /><em>neighbor.</em></>}</h2>
        <p>Every item shared is a little more possibility for someone nearby.</p>
        <div className="auth-art-note"><span className="auth-art-note-dot" /> Give useful things a second life.</div>
      </aside>
      <section className="auth-form-wrap" aria-labelledby="auth-heading">
        <form className="form-card auth-form-card" onSubmit={submit}>
          <div className="auth-form-heading">
            <span className="kicker">{register ? 'Make yourself at home' : 'Your community is waiting'}</span>
            <h1 id="auth-heading">{register ? 'Create your account' : 'Login to your account'}</h1>
            <p className="muted">{register ? 'Join your neighbors in keeping good things in use.' : 'Pick up where you left off.'}</p>
          </div>
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="auth-fields">
            {register && (
              <>
                <label className="auth-field">
                  Full name
                  <input name="name" value={values.name} onChange={change} required minLength="2" maxLength="100" autoComplete="name" />
                </label>
                <label className="auth-field">
                  Phone number
                  <PhoneInput value={values.phone} onChange={changePhone} required />
                </label>
              </>
            )}
            <label className="auth-field">
              Email address
              <input type="email" name="email" value={values.email} onChange={change} required autoComplete="email" />
            </label>
            {passwordInput('password', 'Password', register ? 'new-password' : 'current-password', register && <small>At least 5 characters with uppercase, lowercase, and a number.</small>)}
            {register && passwordInput('confirmPassword', 'Confirm password', 'new-password')}
          </div>
          <button className="button form-submit" disabled={busy}>
            {busy ? 'One moment…' : register ? 'Create my account' : 'Log in'}
          </button>
          {!register && <div className="auth-options"><label><input type="checkbox" name="remember" /> Remember me</label></div>}
          {googleEnabled && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <div className="google-login">{googleButton}</div>
            </>
          )}
          <p className="form-switch">
            {register ? 'Already a member?' : 'New around here?'}{' '}
            <Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create an account'}</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

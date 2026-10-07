import { useNavigate } from 'react-router-dom';
import AuthScreen from '../components/AuthScreen';

export default function LoginPageRoute() {
  const navigate = useNavigate();
  return <AuthScreen onViewPricing={() => navigate('/pricing')} />;
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AvatarAdGeneratorPage() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/?tab=avatar-ad-gen', { replace: true });
  }, [navigate]);

  return null;
}

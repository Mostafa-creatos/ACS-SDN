// @ts-nocheck
import { render, screen, waitFor } from '@testing-library/react';
import { ZtpConsolePage } from '../ZtpConsolePage';
import { AuthProvider } from '../../context/AuthContext';
import { BrowserRouter } from 'react-router-dom';

const renderWithContext = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>
  );
};

describe('ZtpConsolePage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders the empty state correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    renderWithContext(<ZtpConsolePage />);

    expect(screen.getByText('ZTP Console')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('No devices in the discovery pool.')).toBeInTheDocument();
    });
  });

  it('renders a list of discovered devices', async () => {
    const mockData = [
      {
        discovery_id: '123',
        mac_address: '00:11:22:33:44:55',
        serial_number: 'TEST-SERIAL',
        hardware_vendor: 'dell_os10',
        os_version: '10.5',
        current_dhcp_ip: '192.168.1.100',
        first_seen: new Date().toISOString(),
        onboarding_status: 'pending'
      }
    ];

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    renderWithContext(<ZtpConsolePage />);

    await waitFor(() => {
      expect(screen.getByText('TEST-SERIAL')).toBeInTheDocument();
      expect(screen.getByText('00:11:22:33:44:55')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });
});

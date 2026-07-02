import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DoctorForm } from '#src/modules/admin/components/DoctorForm/DoctorForm.jsx';

describe('DoctorForm (A-01)', () => {
  // jsdom lacks URL.createObjectURL; the photo preview effect relies on it (house pattern).
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });
  // Unmount (runs the preview effect's revokeObjectURL cleanup) while URL is still stubbed,
  // then remove the stub.
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('add mode collects all F10.01 fields incl. initial password, submits PKR fee as paisa', () => {
    const onSubmit = vi.fn();
    render(<DoctorForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Dr New' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.dev' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03001234567' } });
    fireEvent.change(screen.getByLabelText('PMC number'), { target: { value: 'PMC-9' } });
    fireEvent.change(screen.getByLabelText('Specialization'), { target: { value: 'Acne' } });
    fireEvent.change(screen.getByLabelText('Consultation fee (PKR)'), {
      target: { value: '2500' },
    });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Consultant.' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'Password123' },
    });
    // ISSUE-6: a photo is now required to submit the add form.
    const photo = new File(['x'], 'doc.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/profile photo/i), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save doctor' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        fullName: 'Dr New',
        email: 'new@x.dev',
        phone: '03001234567',
        pmcNumber: 'PMC-9',
        specialization: 'Acne',
        fee: 250000,
        bio: 'Consultant.',
        initialPassword: 'Password123',
        blocks: [],
      },
      photo,
    );
  });

  it('add mode requires a profile photo before submit (ISSUE-6 / F10.01)', () => {
    const onSubmit = vi.fn();
    render(<DoctorForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Dr New' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.dev' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03001234567' } });
    fireEvent.change(screen.getByLabelText('PMC number'), { target: { value: 'PMC-9' } });
    fireEvent.change(screen.getByLabelText('Specialization'), { target: { value: 'Acne' } });
    fireEvent.change(screen.getByLabelText('Consultation fee (PKR)'), {
      target: { value: '2500' },
    });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Consultant.' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'Password123' },
    });
    // No photo attached.
    fireEvent.click(screen.getByRole('button', { name: 'Save doctor' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/photo is required/i)).toBeTruthy();
  });

  it('edit mode omits PMC, email and password entirely and shows the fee-snapshot note (#8/#6)', () => {
    render(
      <DoctorForm
        mode="edit"
        initial={{ fullName: 'Dr A', phone: '0300', specialization: 'Acne', fee: 250000, bio: 'b' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByLabelText('PMC number')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Initial password')).toBeNull();
    expect(screen.getByText(/never affect existing appointments/)).toBeTruthy();
  });

  it('edit mode shows the existing photo, and previews a newly selected file', () => {
    render(
      <DoctorForm
        mode="edit"
        initial={{ fullName: 'Dr A', phone: '0300', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: '/uploads/doctors/abc.jpg' }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    // Existing photo is shown on open.
    const img = screen.getByAltText('Profile photo preview');
    expect(img.getAttribute('src')).toBe('/uploads/doctors/abc.jpg');
    // Selecting a new file swaps the preview to the object URL.
    const photo = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/profile photo/i), { target: { files: [photo] } });
    expect(screen.getByAltText('Profile photo preview').getAttribute('src')).toBe('blob:preview');
  });

  it('weekly template editor adds a block row into the submitted payload', () => {
    const onSubmit = vi.fn();
    render(<DoctorForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    // defaults: Monday 09:00–17:00 — submit without filling the rest fails HTML validation,
    // so fill the required fields minimally first:
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'd@x.dev' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03001234567' } });
    fireEvent.change(screen.getByLabelText('PMC number'), { target: { value: 'P-1' } });
    fireEvent.change(screen.getByLabelText('Specialization'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Consultation fee (PKR)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'Password123' },
    });
    const photo = new File(['x'], 'doc.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/profile photo/i), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save doctor' }));
    expect(onSubmit.mock.calls[0][0].blocks).toEqual([
      { weekday: 1, startTime: '09:00', endTime: '17:00' },
    ]);
  });
});

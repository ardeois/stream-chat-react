import React, { useContext, useEffect } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ChatAutoComplete } from '../ChatAutoComplete';
import {
  generateChannel,
  generateMember,
  generateMessage,
  generateUser,
  getOrCreateChannelApi,
  getTestClientWithUser,
  queryMembersApi,
  useMockedApis,
} from '../../../mock-builders';
import { Chat } from '../../Chat/Chat';
import { Channel } from '../../Channel/Channel';
import { ChatContext } from '../../../context/ChatContext';

let chatClient;
let channel;
const user = generateUser({ id: 'id', name: 'name' });
const mentionUser = generateUser({ id: 'mention-id', name: 'mention-name' });

const ActiveChannelSetter = ({ activeChannel }) => {
  const { setActiveChannel } = useContext(ChatContext);
  useEffect(() => {
    setActiveChannel(activeChannel);
  });
  return null;
};

const renderComponent = async (props = {}, activeChannel = channel) => {
  const placeholderText = props.placeholder || 'placeholder';
  const renderResult = render(
    <Chat client={chatClient}>
      <ActiveChannelSetter activeChannel={activeChannel} />
      <Channel>
        <ChatAutoComplete {...props} placeholder={placeholderText} />
      </Channel>
    </Chat>,
  );
  const textarea = await waitFor(() => renderResult.getByPlaceholderText(placeholderText));
  const typeText = (text) => {
    fireEvent.change(textarea, {
      target: {
        selectionEnd: text.length,
        value: text,
      },
    });
  };
  return { ...renderResult, textarea, typeText };
};

describe('ChatAutoComplete', () => {
  beforeEach(async () => {
    const messages = [generateMessage({ user })];
    const members = [generateMember({ user }), generateMember({ user: mentionUser })];
    const mockedChannel = generateChannel({
      members,
      messages,
    });
    chatClient = await getTestClientWithUser(user);
    useMockedApis(chatClient, [getOrCreateChannelApi(mockedChannel)]);
    channel = chatClient.channel('messaging', mockedChannel.id);
  });

  afterEach(cleanup);

  it('should call onChange with the change event when you type in the input', async () => {
    const onChange = jest.fn();
    const { typeText } = await renderComponent({ onChange });
    typeText('something');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: 'something',
        }),
      }),
    );
  });

  it('should pass the placeholder prop into the textarea', async () => {
    const placeholder = 'something';
    const { getByPlaceholderText } = await renderComponent({ placeholder });

    expect(getByPlaceholderText(placeholder)).toBeInTheDocument();
  });

  it('should pass the disabled prop to the textarea', async () => {
    const { textarea } = await renderComponent({ disabled: true });

    expect(textarea).toBeDisabled();
  });

  it('should let you select emojis when you type :<emoji>', async () => {
    const emojiAutocompleteText = ':smile';
    const { findByText, textarea, typeText } = await renderComponent();
    typeText(emojiAutocompleteText);
    const emoji = await findByText('😄');

    expect(emoji).toBeInTheDocument();

    fireEvent.click(emoji);

    expect(textarea.value).toContain('😄');
  });

  it('should let you select users when you type @<username>', async () => {
    const onSelectItem = jest.fn();
    const userAutocompleteText = `@${mentionUser.name}`;
    const { getAllByText, typeText } = await renderComponent({
      onSelectItem,
    });
    typeText(userAutocompleteText);
    const userText = await getAllByText(mentionUser.name);

    expect(userText).toHaveLength(2);

    fireEvent.click(userText[1]);

    expect(onSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mentionUser.id,
      }),
    );
  });

  it('should let you select users when you type @<userid>', async () => {
    const onSelectItem = jest.fn();
    const userAutocompleteText = `@${mentionUser.id}`;
    const { findByText, typeText } = await renderComponent({ onSelectItem });
    typeText(userAutocompleteText);
    const userText = await findByText(mentionUser.name);

    expect(userText).toBeInTheDocument();

    fireEvent.click(userText);

    expect(onSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mentionUser.id,
      }),
    );
  });

  it('should let you select commands when you type /<command>', async () => {
    const commandAutocompleteText = '/giph';
    const { findByText, textarea, typeText } = await renderComponent({
      commands: [
        {
          args: '[text]',
          description: 'Post a random gif to the channel',
          name: 'giphy',
          set: 'fun_set',
        },
      ],
    });
    typeText(commandAutocompleteText);
    const command = await findByText('giphy');

    expect(command).toBeInTheDocument();

    fireEvent.click(command);

    expect(textarea.value).toContain('/giphy');
  });

  it('should disable mention popup list', async () => {
    const onSelectItem = jest.fn();
    const userAutocompleteText = `@${user.name}`;
    const { queryAllByText, typeText } = await renderComponent({
      disableMentions: true,
      onSelectItem,
    });
    typeText(userAutocompleteText);
    const userText = await queryAllByText(user.name);

    // eslint-disable-next-line jest-dom/prefer-in-document
    expect(userText).toHaveLength(0);
  });

  it('should use the queryMembers API for mentions if a channel has many members', async () => {
    const users = Array(100).fill().map(generateUser);
    const members = users.map((u) => generateMember({ user: u }));
    const messages = [generateMessage({ user: users[0] })];
    const mockedChannel = generateChannel({
      members,
      messages,
    });
    useMockedApis(chatClient, [getOrCreateChannelApi(mockedChannel)]);
    const activeChannel = chatClient.channel('messaging', mockedChannel.id);
    const searchMember = members[0];
    useMockedApis(chatClient, [queryMembersApi([searchMember])]);

    const onSelectItem = jest.fn();
    const { findByText, typeText } = await renderComponent({
      activeChannel,
      onSelectItem,
    });
    const mentionedUser = searchMember.user;

    typeText(`@${mentionedUser.id}`);

    const userText = await findByText(mentionedUser.name);
    expect(userText).toBeInTheDocument();

    fireEvent.click(userText);

    expect(onSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mentionedUser.id,
      }),
    );
  });
});
